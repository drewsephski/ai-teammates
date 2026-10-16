import { createClerkClient } from "@clerk/backend"
import * as Sentry from "@sentry/node"
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm"

import { db } from "@/db"
import {
  accountPlans,
  usageEntries,
  usageHolds,
  type NewUsageEntry,
  type UsageKind,
} from "@/db/schema"
import { accountPlan } from "@/lib/billing-policy"
import { resolvePlan, type AccountPlan } from "@/lib/plan-cache"

// Not @clerk/nextjs: the Trigger.dev tasks meter usage too, outside Next.js
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })

async function readClerkPlan(userId: string): Promise<AccountPlan> {
  try {
    const subscription = await clerk.billing.getUserBillingSubscription(userId)
    return accountPlan(subscription.subscriptionItems)
  } catch (error) {
    // Clerk may not have created the default free subscription yet. Other
    // provider failures must not silently downgrade a paid user's allowance.
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 404
    )
      return accountPlan([])
    throw error
  }
}

// One turn asks for the plan many times; share a read for a few seconds
const recent = new Map<string, { at: number; plan: Promise<AccountPlan> }>()
const MEMO_MS = 10_000

// Cached in account_plans (see lib/plan-cache.ts). `fresh` skips the cache,
// for pages where the person may have just upgraded.
export async function getAccountPlan(
  userId: string,
  options: { fresh?: boolean } = {}
): Promise<AccountPlan> {
  const now = Date.now()
  const hit = recent.get(userId)
  if (!options.fresh && hit && now - hit.at < MEMO_MS) return hit.plan
  const plan = (async () => {
    const [cached] = options.fresh
      ? []
      : await db
          .select()
          .from(accountPlans)
          .where(eq(accountPlans.userId, userId))
    return resolvePlan({
      cached,
      now,
      fetch: () => readClerkPlan(userId),
      save: async (row) => {
        await db
          .insert(accountPlans)
          .values({ userId, ...row })
          .onConflictDoUpdate({ target: accountPlans.userId, set: row })
      },
      onStale: (error) =>
        Sentry.logger.warn("Clerk billing unavailable; using cached plan", {
          "user.id": userId,
          "error.type": error instanceof Error ? error.name : "UnknownError",
        }),
    })
  })()
  recent.set(userId, { at: now, plan })
  plan.catch(() => recent.delete(userId))
  if (recent.size > 5_000) recent.delete(recent.keys().next().value!)
  return plan
}

// Free credit is lifetime usage, so deleting bots, reconnecting apps, or
// switching plans cannot reset the starter allowance. AI spend that running
// turns hold but haven't written yet counts too.
export async function getUsage(
  userId: string,
  options: { fresh?: boolean } = {}
) {
  const plan = await getAccountPlan(userId, options)
  const { period, limits } = plan

  const [rows, [held]] = await Promise.all([
    db
      .select({
        kind: usageEntries.kind,
        amount: sql`sum(${usageEntries.amount})`.mapWith(Number),
      })
      .from(usageEntries)
      .where(
        and(
          eq(usageEntries.userId, userId),
          period.start ? gte(usageEntries.createdAt, period.start) : undefined
        )
      )
      .groupBy(usageEntries.kind),
    db
      .select({
        amount: sql`coalesce(sum(${usageHolds.amount}), 0)`.mapWith(Number),
      })
      .from(usageHolds)
      .where(
        and(
          eq(usageHolds.userId, userId),
          sql`not exists (select 1 from ${usageEntries} where ${usageEntries.idempotencyKey} = ${usageHolds.idempotencyKey})`
        )
      ),
  ])

  const used: Record<UsageKind, number> = { ai: 0, sandbox: 0 }
  for (const row of rows) used[row.kind] = row.amount
  used.ai += held?.amount ?? 0

  return {
    ...plan,
    used,
    remaining: {
      ai: Math.max(0, limits.ai - used.ai),
      sandbox: Math.max(0, limits.sandbox - used.sandbox),
    },
  }
}

export type Usage = NonNullable<Awaited<ReturnType<typeof getUsage>>>

// Adds to the ledger. An entry whose key is already there is left out.
// A hold under the same key is released in the same transaction.
export async function recordUsage(entries: NewUsageEntry[]) {
  if (entries.length === 0) return

  await db.transaction(async (tx) => {
    await tx
      .insert(usageEntries)
      .values(entries)
      .onConflictDoNothing({ target: usageEntries.idempotencyKey })
    await tx.delete(usageHolds).where(
      inArray(
        usageHolds.idempotencyKey,
        entries.map((entry) => entry.idempotencyKey)
      )
    )
  })
}

// What a running turn has spent so far, under the key its ledger entry will
// use. Only ever raised, so a late write can't shrink a hold.
export async function holdUsage(userId: string, key: string, amount: number) {
  if (amount <= 0) return
  await db
    .insert(usageHolds)
    .values({ idempotencyKey: key, userId, amount })
    .onConflictDoUpdate({
      target: usageHolds.idempotencyKey,
      set: {
        amount: sql`greatest(${usageHolds.amount}, excluded.amount)`,
        updatedAt: new Date(),
      },
    })
}

// A turn that died before onTurnComplete still spent its hold. Book holds
// untouched for longer than any turn can run (maxDuration is an hour).
export async function settleAbandonedHolds(olderThanMs = 2 * 3_600_000) {
  const cutoff = new Date(Date.now() - olderThanMs)
  const stale = await db
    .select()
    .from(usageHolds)
    .where(lt(usageHolds.updatedAt, cutoff))
    .limit(500)
  if (!stale.length) return 0
  await recordUsage(
    stale.map((hold) => ({
      userId: hold.userId,
      kind: "ai" as const,
      amount: hold.amount,
      idempotencyKey: hold.idempotencyKey,
    }))
  )
  return stale.length
}
