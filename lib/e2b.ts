import {
  CommandExitError,
  Sandbox,
  SandboxNotFoundError,
  type SandboxInfo,
} from "@e2b/desktop"
import * as Sentry from "@sentry/node"
import { randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"

import { db } from "@/db"
import { bots, sandboxSessions, usageEntries } from "@/db/schema"
import { IDLE_TIMEOUT_MS, runningSeconds } from "@/lib/sandbox-policy"
import { createSandboxLifecycle } from "@/lib/sandbox-lifecycle"
import { withSandboxLock, tryWithSandboxLock } from "@/lib/sandbox-lock"

export const MEMORY_FILE = "/home/user/MEMORY.md"
const APP = "ai-teammates"
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function meterSession(
  tx: Transaction,
  info: SandboxInfo,
  sampledAt: number
) {
  const [owner] = await tx
    .select({ userId: bots.userId })
    .from(bots)
    .where(eq(bots.sandboxId, info.sandboxId))
  if (!owner) return
  const id = `${info.sandboxId}:${info.startedAt.toISOString()}`
  await tx
    .insert(sandboxSessions)
    .values({
      id,
      sandboxId: info.sandboxId,
      userId: owner.userId,
      startedAt: info.startedAt,
      endAt: info.endAt,
    })
    .onConflictDoNothing()
  const [session] = await tx
    .select()
    .from(sandboxSessions)
    .where(eq(sandboxSessions.id, id))
    .for("update")
  const seconds = runningSeconds(info.startedAt, info.endAt, sampledAt)
  const delta = seconds - session.meteredSeconds
  if (delta > 0) {
    await tx
      .insert(usageEntries)
      .values({
        userId: owner.userId,
        kind: "sandbox",
        amount: delta,
        idempotencyKey: `sandbox:${id}:${seconds}`,
      })
      .onConflictDoNothing()
  }
  await tx
    .update(sandboxSessions)
    .set({
      endAt: info.endAt,
      meteredSeconds: Math.max(seconds, session.meteredSeconds),
    })
    .where(eq(sandboxSessions.id, id))
}

const REQUEST_TIMEOUT_MS = 15_000
const providerOptions = { requestTimeoutMs: REQUEST_TIMEOUT_MS }

function reportMaintenance(error: unknown, id: string) {
  Sentry.captureException(error, {
    tags: { "sandbox.operation": "maintenance" },
    extra: { sandboxId: id },
  })
}

function meterInfo(info: SandboxInfo) {
  const sampledAt = Date.now()
  return db.transaction((tx) => meterSession(tx, info, sampledAt))
}

const lifecycle = createSandboxLifecycle({
  getInfo: (id) => Sandbox.getInfo(id, providerOptions),
  connect: (id, timeoutMs) =>
    Sandbox.connect(id, { ...providerOptions, timeoutMs }),
  pause: (id) => Sandbox.pause(id, providerOptions),
  meter: meterInfo,
  lock: withSandboxLock,
  tryLock: tryWithSandboxLock,
  report: reportMaintenance,
})

export const withBotSandbox = lifecycle.run
export const getBotSandboxInfo = lifecycle.getInfo
export const renewBotDesktop = lifecycle.renewDesktop
export const pauseBotSandbox = lifecycle.pause

export async function createBotSandbox(botId: string) {
  const creationId = randomUUID()
  let sandbox: Sandbox | undefined
  try {
    sandbox = await Sandbox.create({
      resolution: [1024, 768],
      ...providerOptions,
      metadata: { app: APP, botId, creationId },
      timeoutMs: IDLE_TIMEOUT_MS,
      lifecycle: { onTimeout: "pause", autoResume: false },
      network: { allowPublicTraffic: false },
    })
    await sandbox.files.write(MEMORY_FILE, "")
    // Creating a teammate should not keep an unused computer running.
    await sandbox.pause()
    return sandbox.sandboxId
  } catch (error) {
    try {
      if (sandbox) await sandbox.kill()
      else {
        // Desktop startup may throw after the VM was allocated. Find only this
        // exact create attempt; never delete a concurrent bot's computer.
        const pending = Sandbox.list({
          ...providerOptions,
          query: { metadata: { creationId }, state: ["running", "paused"] },
        })
        while (pending.hasNext) {
          for (const info of await pending.nextItems())
            await Sandbox.kill(info.sandboxId, providerOptions)
        }
      }
    } catch (cleanupError) {
      reportMaintenance(cleanupError, sandbox?.sandboxId ?? creationId)
    }
    throw error
  }
}

export async function readBotMemory(sandbox: Sandbox) {
  return sandbox.files.read(MEMORY_FILE)
}

// Stream credentials are consumed only by the server's authenticated gateway.
export async function getBotDesktopConnection(id: string) {
  return withBotSandbox(id, async (sandbox) => {
    if (!sandbox.trafficAccessToken)
      throw new Error("Private desktop access is unavailable")
    const running = await runSandboxCommand(sandbox, "pgrep -x x11vnc")
    if (running.exitCode !== 0) await sandbox.stream.start()
    return {
      url: `wss://${sandbox.getHost(6080)}/websockify`,
      token: sandbox.trafficAccessToken,
      startedAt: (await sandbox.getInfo()).startedAt,
    }
  })
}

export async function deleteBotSandbox(id: string) {
  await withSandboxLock(id, async () => {
    try {
      await Sandbox.pause(id, providerOptions)
      await meterInfo(await Sandbox.getInfo(id, providerOptions))
    } catch (error) {
      if (!(error instanceof SandboxNotFoundError)) throw error
    }
    await Sandbox.kill(id, providerOptions)
    await db.delete(sandboxSessions).where(eq(sandboxSessions.sandboxId, id))
  })
}

// Metering has its own short row-locked transaction and never waits on a tool.
export async function meterBotSandbox(id: string) {
  try {
    await meterInfo(await Sandbox.getInfo(id, providerOptions))
  } catch (error) {
    if (!(error instanceof SandboxNotFoundError)) throw error
    return false
  }
  return true
}

// Reset is explicit and only available for a definitively missing computer.
// Recheck under the old ID's lock; concurrent resets adopt the same replacement.
export async function resetBotSandbox(
  botId: string,
  userId: string,
  oldId: string
) {
  return withSandboxLock(`bot:${botId}`, () =>
    withSandboxLock(oldId, async () => {
      const [bot] = await db
        .select()
        .from(bots)
        .where(and(eq(bots.id, botId), eq(bots.userId, userId)))
      if (!bot) throw new Error("Bot not found")
      if (bot.sandboxId !== oldId) return bot.sandboxId
      try {
        await Sandbox.getInfo(oldId, providerOptions)
        throw new Error(
          "The computer still exists. Reconnect instead of resetting it."
        )
      } catch (error) {
        if (!(error instanceof SandboxNotFoundError)) throw error
      }
      const id = await createBotSandbox(botId)
      try {
        const [updated] = await db
          .update(bots)
          .set({ sandboxId: id })
          .where(
            and(
              eq(bots.id, botId),
              eq(bots.userId, userId),
              eq(bots.sandboxId, oldId)
            )
          )
          .returning({ id: bots.id })
        if (!updated)
          throw new Error("Bot changed while resetting the computer")
        return id
      } catch (error) {
        // An UPDATE response can be lost after Postgres committed. Never kill a
        // replacement which has already become this bot's registered computer.
        let current
        try {
          current = await db.query.bots.findFirst({ where: eq(bots.id, botId) })
        } catch (lookupError) {
          reportMaintenance(lookupError, id)
          // Provisioning already paused it; leave uncertain ownership for review.
          reportMaintenance(error, id)
          throw error
        }
        if (current?.sandboxId === id) return id
        await Sandbox.kill(id, providerOptions).catch((cleanupError: unknown) =>
          reportMaintenance(cleanupError, id)
        )
        throw error
      }
    })
  )
}

export async function listBotSandboxes() {
  const paginator = Sandbox.list({
    ...providerOptions,
    query: { metadata: { app: APP }, state: ["running", "paused"] },
  })
  const sandboxes: SandboxInfo[] = []
  while (paginator.hasNext) sandboxes.push(...(await paginator.nextItems()))
  return sandboxes
}

export async function runSandboxCommand(
  sandbox: Sandbox,
  command: string,
  cwd = "/home/user",
  timeoutMs = 60_000
) {
  try {
    return await sandbox.commands.run(command, { cwd, timeoutMs })
  } catch (error) {
    // E2B throws on nonzero exit; the agent needs its output to recover.
    if (error instanceof CommandExitError) return error
    throw error
  }
}
