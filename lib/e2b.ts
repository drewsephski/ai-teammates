import {
  CommandExitError,
  Sandbox,
  SandboxNotFoundError,
  type SandboxInfo,
} from "@e2b/desktop"
import { eq, sql } from "drizzle-orm"

import { db } from "@/db"
import { bots, sandboxSessions, usageEntries } from "@/db/schema"
import {
  IDLE_TIMEOUT_MS,
  runningSeconds,
  sandboxTimeout,
} from "@/lib/sandbox-policy"

export const MEMORY_FILE = "/home/user/MEMORY.md"
const APP = "ai-teammates"
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function meterSession(tx: Transaction, info: SandboxInfo) {
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
  const seconds = runningSeconds(info.startedAt, info.endAt)
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

// A transaction-scoped lock serializes tools, desktop leases and pause/delete
// across Railway and Trigger workers, including separate chats for the same bot.
async function withSandboxLock<T>(
  id: string,
  operation: (tx: Transaction) => Promise<T>
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`
    )
    return operation(tx)
  })
}

export async function createBotSandbox(botId: string) {
  const sandbox = await Sandbox.create({
    resolution: [1024, 768],
    metadata: { app: APP, botId },
    timeoutMs: IDLE_TIMEOUT_MS,
    lifecycle: { onTimeout: "pause", autoResume: false },
    network: { allowPublicTraffic: false },
  })
  try {
    await sandbox.files.write(MEMORY_FILE, "")
    // Creating a teammate should not keep an unused computer running.
    await sandbox.pause()
    return sandbox.sandboxId
  } catch (error) {
    await sandbox.kill().catch(() => {})
    throw error
  }
}

export async function withBotSandbox<T>(
  id: string,
  operation: (sandbox: Sandbox) => Promise<T>,
  leaseMs = IDLE_TIMEOUT_MS,
  resume = true
) {
  const outcome = await withSandboxLock(id, async (tx) => {
    let info = await Sandbox.getInfo(id)
    await meterSession(tx, info)
    if (info.state === "paused" && !resume)
      return { ok: false as const, error: new Error("Computer paused") }
    // An operation must fit wholly within this session. Rotate via pause,
    // never kill/recreate, so files and running applications survive.
    if (info.state === "running" && sandboxTimeout(info.startedAt) < leaseMs) {
      await Sandbox.pause(id)
      info = await Sandbox.getInfo(id)
      await meterSession(tx, info)
      if (!resume)
        return {
          ok: false as const,
          error: new Error("Computer paused at session limit"),
        }
    }
    const sandbox = await Sandbox.connect(id, { timeoutMs: leaseMs })
    info = await sandbox.getInfo()
    const timeout = sandboxTimeout(info.startedAt, Date.now(), leaseMs)
    await sandbox.setTimeout(timeout)
    await meterSession(tx, await sandbox.getInfo())
    try {
      return { ok: true as const, value: await operation(sandbox) }
    } catch (error) {
      // Commit lifecycle/metering even if the tool itself fails.
      return { ok: false as const, error }
    } finally {
      await sandbox.setTimeout(sandboxTimeout(info.startedAt))
      // Update the lease/meter even when a command exits unsuccessfully.
      await meterSession(tx, await Sandbox.getInfo(id))
    }
  })
  if (!outcome.ok) throw outcome.error
  return outcome.value
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
    }
  })
}

export async function pauseBotSandbox(id: string) {
  return withSandboxLock(id, async (tx) => {
    await Sandbox.pause(id)
    await meterSession(tx, await Sandbox.getInfo(id))
  })
}

export async function deleteBotSandbox(id: string) {
  await withSandboxLock(id, async (tx) => {
    try {
      await Sandbox.pause(id)
      await meterSession(tx, await Sandbox.getInfo(id))
    } catch (error) {
      if (!(error instanceof SandboxNotFoundError)) throw error
    }
    await Sandbox.kill(id)
    await tx.delete(sandboxSessions).where(eq(sandboxSessions.sandboxId, id))
  })
}

export async function meterBotSandbox(id: string) {
  return withSandboxLock(id, async (tx) =>
    meterSession(tx, await Sandbox.getInfo(id))
  )
}

export async function listBotSandboxes() {
  const paginator = Sandbox.list({ query: { metadata: { app: APP } } })
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
