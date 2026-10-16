import {
  CommandExitError,
  Sandbox,
  SandboxNotFoundError,
  type SandboxInfo,
} from "@e2b/desktop"
import * as Sentry from "@sentry/node"
import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"

import { db } from "@/db"
import { computers, sandboxSessions, usageEntries } from "@/db/schema"
import { IDLE_TIMEOUT_MS, runningSeconds } from "@/lib/sandbox-policy"
import { createSandboxLifecycle } from "@/lib/sandbox-lifecycle"
import { withSandboxLock, tryWithSandboxLock } from "@/lib/sandbox-lock"

const APP = "ai-teammates"
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function meterSession(
  tx: Transaction,
  info: SandboxInfo,
  sampledAt: number
) {
  const [owner] = await tx
    .select({ userId: computers.userId })
    .from(computers)
    .where(eq(computers.sandboxId, info.sandboxId))
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

export const withComputer = lifecycle.run
export const getComputerInfo = lifecycle.getInfo
export const renewComputerDesktop = lifecycle.renewDesktop
export const pauseComputer = lifecycle.pause

export async function createAccountSandbox(userId: string) {
  const creationId = randomUUID()
  let sandbox: Sandbox | undefined
  try {
    sandbox = await Sandbox.create({
      resolution: [1024, 768],
      ...providerOptions,
      metadata: { app: APP, userId, creationId },
      timeoutMs: IDLE_TIMEOUT_MS,
      lifecycle: { onTimeout: "pause", autoResume: false },
      network: { allowPublicTraffic: false },
    })
    // Creating a computer should not keep an unused one running.
    await sandbox.pause()
    return sandbox.sandboxId
  } catch (error) {
    try {
      if (sandbox) await sandbox.kill()
      else {
        // Desktop startup may throw after the VM was allocated. Find only this
        // exact create attempt; never delete a concurrent create's computer.
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

// Stream credentials are consumed only by the server's authenticated gateway.
export async function getDesktopConnection(id: string) {
  return withComputer(id, async (sandbox) => {
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

export async function deleteSandbox(id: string) {
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
export async function meterSandbox(id: string) {
  try {
    await meterInfo(await Sandbox.getInfo(id, providerOptions))
  } catch (error) {
    if (!(error instanceof SandboxNotFoundError)) throw error
    return false
  }
  return true
}

// True while the provider still has the computer; false only when it is
// definitively gone. Other errors propagate so a hiccup never reads as missing.
export async function sandboxExists(id: string) {
  try {
    await Sandbox.getInfo(id, providerOptions)
    return true
  } catch (error) {
    if (error instanceof SandboxNotFoundError) return false
    throw error
  }
}

// Meters a computer from its entry in listAppSandboxes, with no extra call
export async function meterListedSandbox(info: SandboxInfo) {
  await meterInfo(info)
  return true
}

// An app computer no account owns. Nothing to bill, so it goes without metering.
export async function deleteOrphanSandbox(id: string) {
  await withSandboxLock(id, async () => {
    const [owner] = await db
      .select({ userId: computers.userId })
      .from(computers)
      .where(eq(computers.sandboxId, id))
    // Adopted since the list was read
    if (owner) return
    await Sandbox.kill(id, providerOptions)
  })
}

export async function listAppSandboxes() {
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
  timeoutMs = 60_000,
  // Kills the command when aborted, instead of leaving it running
  signal?: AbortSignal
) {
  try {
    if (!signal) return await sandbox.commands.run(command, { cwd, timeoutMs })
    signal.throwIfAborted()
    const handle = await sandbox.commands.run(command, {
      cwd,
      timeoutMs,
      background: true,
    })
    const kill = () => void handle.kill().catch(() => {})
    signal.addEventListener("abort", kill, { once: true })
    try {
      if (signal.aborted) kill()
      return await handle.wait()
    } finally {
      signal.removeEventListener("abort", kill)
    }
  } catch (error) {
    // E2B throws on nonzero exit; the agent needs its output to recover.
    if (error instanceof CommandExitError) return error
    throw error
  }
}
