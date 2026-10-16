import { setTimeout as sleepFor } from "node:timers/promises"
import * as Sentry from "@sentry/node"
import { and, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm"

import { db } from "@/db"
import { bots, computers } from "@/db/schema"
import {
  LEASE_POLL_MS,
  LEASE_WAIT_MS,
  leaseExpiry,
  type LeaseHolder,
} from "@/lib/computer-lease-policy"
import {
  createAccountSandbox,
  deleteSandbox,
  pauseComputer,
  sandboxExists,
} from "@/lib/e2b"
import { withSandboxLock } from "@/lib/sandbox-lock"

// Every person has one computer, shared by all their bots. Importable from
// Trigger.dev and plain Node: no next/*, @sentry/nextjs or server-only.

// The provider calls, injectable so tests need no network.
export type ComputerProvider = {
  create: (userId: string) => Promise<string>
  remove: (sandboxId: string) => Promise<unknown>
  exists: (sandboxId: string) => Promise<boolean>
  pause: (sandboxId: string) => Promise<unknown>
}

const e2b: ComputerProvider = {
  create: createAccountSandbox,
  remove: deleteSandbox,
  exists: sandboxExists,
  pause: pauseComputer,
}

const lockKey = (userId: string) => `computer:${userId}`

// Only while the person still has a bot: a turn still running during account
// deletion must not bring the computer back. One statement, so a deletion
// can't land between the check and the insert.
async function ensureRow(userId: string) {
  await db
    .insert(computers)
    .select(
      db
        .select({
          userId: bots.userId,
          sandboxId: sql<null>`null`.as("sandbox_id"),
          leaseBotId: sql<null>`null`.as("lease_bot_id"),
          leaseChatId: sql<null>`null`.as("lease_chat_id"),
          leaseRunKey: sql<null>`null`.as("lease_run_key"),
          leaseExpiresAt: sql<null>`null`.as("lease_expires_at"),
          lastUsedAt: sql<null>`null`.as("last_used_at"),
          createdAt: sql<Date>`now()`.as("created_at"),
          updatedAt: sql<Date>`now()`.as("updated_at"),
        })
        .from(bots)
        .where(eq(bots.userId, userId))
        .limit(1)
    )
    .onConflictDoNothing()
  const [row] = await db
    .select({ userId: computers.userId })
    .from(computers)
    .where(eq(computers.userId, userId))
  if (!row) throw new Error("Bot not found")
}

export async function accountComputerId(userId: string) {
  const [row] = await db
    .select({ sandboxId: computers.sandboxId })
    .from(computers)
    .where(eq(computers.userId, userId))
  return row?.sandboxId ?? null
}

// Serialized with reset and delete. No fake or placeholder computer IDs.
export async function ensureAccountComputer(
  userId: string,
  provider: ComputerProvider = e2b
) {
  return withSandboxLock(lockKey(userId), async () => {
    await ensureRow(userId)
    const existing = await accountComputerId(userId)
    if (existing) return existing
    const sandboxId = await provider.create(userId)
    let deleted = false
    try {
      const [saved] = await db
        .update(computers)
        .set({ sandboxId, updatedAt: new Date() })
        .where(and(eq(computers.userId, userId), isNull(computers.sandboxId)))
        .returning({ userId: computers.userId })
      if (saved) return sandboxId
      // Registered meanwhile (account deleted, or another writer): keep theirs.
      const winner = await accountComputerId(userId)
      await provider.remove(sandboxId).catch((cleanupError: unknown) =>
        Sentry.captureException(cleanupError, {
          extra: { userId, sandboxId },
        })
      )
      if (winner) return winner
      deleted = true
    } catch (error) {
      // Postgres may commit even if the UPDATE response is lost. Do not delete
      // the computer until we know it did not become the registered one.
      let current
      try {
        current = await accountComputerId(userId)
      } catch (lookupError) {
        Sentry.captureException(lookupError, { extra: { userId, sandboxId } })
        Sentry.captureException(error, { extra: { userId, sandboxId } })
        throw error
      }
      if (current === sandboxId) return sandboxId
      if (current) return current
      await provider.remove(sandboxId).catch((cleanupError: unknown) =>
        Sentry.captureException(cleanupError, {
          extra: { userId, sandboxId },
        })
      )
      throw error
    }
    // The row went with the account; the new computer was already removed
    if (deleted) throw new Error("Your account was deleted.")
    return sandboxId
  })
}

type LeaseOptions = {
  waitMs?: number
  pollMs?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  // How long the call about to run may take (leaseExpiry)
  holdMs?: number
}

async function holderOf(userId: string) {
  const [row] = await db
    .select({
      botId: computers.leaseBotId,
      name: bots.name,
      expiresAt: computers.leaseExpiresAt,
      runKey: computers.leaseRunKey,
    })
    .from(computers)
    // Owner-scoped: a bot of another account never names itself here
    .leftJoin(
      bots,
      and(eq(bots.id, computers.leaseBotId), eq(bots.userId, userId))
    )
    .where(eq(computers.userId, userId))
  return row ?? null
}

// One atomic UPDATE takes or renews the lease; a held, unexpired lease of
// another turn updates nothing. Waits up to waitMs, then reports the holder.
export async function acquireComputerLease(
  userId: string,
  holder: LeaseHolder,
  options: LeaseOptions = {}
): Promise<
  { ok: true } | { ok: false; heldBy: { botId: string; name: string } }
> {
  const waitMs = options.waitMs ?? LEASE_WAIT_MS
  const pollMs = options.pollMs ?? LEASE_POLL_MS
  const sleep = options.sleep ?? ((ms: number) => sleepFor(ms).then(() => {}))
  const clock = options.now ?? Date.now
  await ensureRow(userId)
  const polls = pollMs > 0 ? Math.ceil(waitMs / pollMs) : 0
  for (let attempt = 0; ; attempt++) {
    const now = clock()
    const at = new Date(now)
    const expiry = leaseExpiry(now, options.holdMs).toISOString()
    const [taken] = await db
      .update(computers)
      .set({
        leaseBotId: holder.botId,
        leaseChatId: holder.chatId,
        leaseRunKey: holder.runKey,
        // A renewal never shortens this turn's own lease: a parallel call
        // from the same step may still be running a long command
        leaseExpiresAt: sql`CASE WHEN ${computers.leaseRunKey} = ${holder.runKey} AND ${computers.leaseExpiresAt} > ${expiry}::timestamptz THEN ${computers.leaseExpiresAt} ELSE ${expiry}::timestamptz END`,
        lastUsedAt: at,
        updatedAt: at,
      })
      .where(
        and(
          eq(computers.userId, userId),
          or(
            isNull(computers.leaseRunKey),
            eq(computers.leaseRunKey, holder.runKey),
            isNull(computers.leaseExpiresAt),
            lte(computers.leaseExpiresAt, at)
          )
        )
      )
      .returning({ userId: computers.userId })
    if (taken) return { ok: true }
    if (attempt >= polls) break
    await sleep(pollMs)
  }
  const held = await holderOf(userId)
  return {
    ok: false,
    heldBy: {
      botId: held?.botId ?? "",
      name: held?.name ?? "Another bot",
    },
  }
}

// Extends a lease this turn still holds, counting from now, and never takes a
// free or another turn's lease: after a call ends, a turn that already
// released the computer (a stopped turn) must not take it back.
export async function renewComputerLease(
  userId: string,
  runKey: string,
  now = Date.now()
) {
  const at = new Date(now)
  const expiry = leaseExpiry(now).toISOString()
  const [renewed] = await db
    .update(computers)
    .set({
      leaseExpiresAt: sql`GREATEST(${computers.leaseExpiresAt}, ${expiry}::timestamptz)`,
      lastUsedAt: at,
      updatedAt: at,
    })
    .where(and(eq(computers.userId, userId), eq(computers.leaseRunKey, runKey)))
    .returning({ userId: computers.userId })
  return !!renewed
}

export async function releaseComputerLease(userId: string, runKey: string) {
  await db
    .update(computers)
    .set({
      leaseBotId: null,
      leaseChatId: null,
      leaseRunKey: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(computers.userId, userId), eq(computers.leaseRunKey, runKey)))
}

// Only an unexpired lease counts as the computer being in use.
export async function computerInUseBy(userId: string, now = Date.now()) {
  const held = await holderOf(userId)
  if (!held?.runKey || !held.expiresAt || held.expiresAt.getTime() <= now)
    return null
  return { botId: held.botId ?? "", name: held.name ?? "Another bot" }
}

// Reset is explicit and only available for a definitively missing computer.
// Recheck under the account lock (a missing computer has no tool to wait for); concurrent resets adopt the same replacement
// when the caller passes the ID it saw.
export async function resetAccountComputer(
  userId: string,
  seenId?: string,
  provider: ComputerProvider = e2b
) {
  return withSandboxLock(lockKey(userId), async () => {
    const oldId = await accountComputerId(userId)
    if (!oldId) throw new Error("Your computer has not been provisioned yet.")
    if (seenId && oldId !== seenId) return oldId
    if (await provider.exists(oldId))
      throw new Error(
        "The computer still exists. Reconnect instead of resetting it."
      )
    const id = await provider.create(userId)
    try {
      const [updated] = await db
        .update(computers)
        .set({
          sandboxId: id,
          leaseBotId: null,
          leaseChatId: null,
          leaseRunKey: null,
          leaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(eq(computers.userId, userId), eq(computers.sandboxId, oldId))
        )
        .returning({ userId: computers.userId })
      if (!updated) throw new Error("Computer changed while resetting it")
      return id
    } catch (error) {
      // An UPDATE response can be lost after Postgres committed. Never kill a
      // replacement which has already become the registered computer.
      let current
      try {
        current = await accountComputerId(userId)
      } catch (lookupError) {
        // Provisioning already paused it; leave uncertain ownership for review.
        Sentry.captureException(lookupError, { extra: { userId, id } })
        Sentry.captureException(error, { extra: { userId, id } })
        throw error
      }
      if (current === id) return id
      await provider
        .remove(id)
        .catch((cleanupError: unknown) =>
          Sentry.captureException(cleanupError, { extra: { userId, id } })
        )
      throw error
    }
  })
}

export async function pauseAccountComputer(
  userId: string,
  provider: ComputerProvider = e2b
) {
  const sandboxId = await accountComputerId(userId)
  if (sandboxId) await provider.pause(sandboxId)
}

// The deleteAccount step: kills the sandbox (metering it first) and drops the row.
export async function deleteAccountComputer(
  userId: string,
  provider: ComputerProvider = e2b
) {
  await withSandboxLock(lockKey(userId), async () => {
    const sandboxId = await accountComputerId(userId)
    if (sandboxId) await provider.remove(sandboxId)
    await db.delete(computers).where(eq(computers.userId, userId))
  })
}

// Owners for metering: every registered computer.
export async function listComputerOwners() {
  return db
    .select({
      sandboxId: sql<string>`${computers.sandboxId}`,
      userId: computers.userId,
    })
    .from(computers)
    .where(isNotNull(computers.sandboxId))
}
