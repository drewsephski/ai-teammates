import {
  CommandExitError,
  Sandbox,
  SandboxNotFoundError,
  type SandboxInfo,
  type SandboxOpts,
} from "@e2b/desktop"
import * as Sentry from "@sentry/node"
import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"

import { db } from "@/db"
import { computers, sandboxSessions, usageEntries } from "@/db/schema"
import {
  COMPUTER_TEMPLATE,
  computerShellFor,
  DESKTOP_HOME,
  HARDEN_DESKTOP_SCRIPT,
  HARDEN_ROOT_SCRIPT,
  type ComputerShell,
} from "@/lib/computer-shell"
import {
  COMPUTERS_BUSY_ERROR,
  IDLE_TIMEOUT_MS,
  isProviderCapacityError,
  runningSeconds,
} from "@/lib/sandbox-policy"
import { createSandboxLifecycle } from "@/lib/sandbox-lifecycle"
import { withSandboxLock, tryWithSandboxLock } from "@/lib/sandbox-lock"
import { getUsage } from "@/lib/usage"

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

// E2B's rate limit, quota and cap on sandboxes running at once all read the
// same to a person: wait a few minutes. Anything else passes through.
export function mapProviderError(error: unknown) {
  if (!isProviderCapacityError(error)) return error
  Sentry.captureException(error, {
    level: "warning",
    tags: { "sandbox.operation": "capacity" },
  })
  return new Error(COMPUTERS_BUSY_ERROR, { cause: error })
}

async function mapped<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    throw mapProviderError(error)
  }
}

// What the computer's owner has left, read right after metering. The lifecycle
// caps each lease, idle pause and viewer renewal by it, so a computer pauses
// itself when the allowance runs out instead of waiting for the cron.
export async function computerAllowance(sandboxId: string) {
  const [owner] = await db
    .select({ userId: computers.userId })
    .from(computers)
    .where(eq(computers.sandboxId, sandboxId))
  if (!owner) return null
  const usage = await getUsage(owner.userId)
  return usage ? { seconds: usage.remaining.sandbox, tier: usage.tier } : null
}

const lifecycle = createSandboxLifecycle({
  getInfo: (id) => mapped(() => Sandbox.getInfo(id, providerOptions)),
  connect: (id, timeoutMs) =>
    mapped(() => Sandbox.connect(id, { ...providerOptions, timeoutMs })),
  pause: (id) => mapped(() => Sandbox.pause(id, providerOptions)),
  meter: meterInfo,
  lock: withSandboxLock,
  tryLock: tryWithSandboxLock,
  report: reportMaintenance,
  allowance: computerAllowance,
})

export const withComputer = lifecycle.run
export const getComputerInfo = lifecycle.getInfo
export const renewComputerDesktop = lifecycle.renewDesktop
export const pauseComputer = lifecycle.pause

// Thrown when a computer from the template can't be hardened: its shell would
// reach the desktop, so nothing runs on it
export const COMPUTER_UNSECURED_ERROR =
  "The computer couldn't be secured for this step. Try again shortly."

// Each computer is hardened once per process before its first use. A computer
// made from the template keeps its kernel and display state across pause and
// resume, so this only repairs what a restart could have lost.
const shells = new Map<string, Promise<ComputerShell>>()

async function hardenComputer(sandbox: Sandbox): Promise<ComputerShell> {
  const root = await sandbox.commands.run(HARDEN_ROOT_SCRIPT, {
    user: "root",
    timeoutMs: 15_000,
  })
  const shell = computerShellFor(root.stdout)
  if (shell.isolated)
    await sandbox.commands.run(HARDEN_DESKTOP_SCRIPT, { timeoutMs: 15_000 })
  return shell
}

// Who runs this computer's shell commands and file tools. Fails closed: when
// a computer from the template can't be hardened, no shell runs on it.
export function computerShell(sandbox: Sandbox) {
  let shell = shells.get(sandbox.sandboxId)
  if (!shell) {
    shell = hardenComputer(sandbox).catch((error: unknown) => {
      shells.delete(sandbox.sandboxId)
      Sentry.captureException(error, {
        tags: { "sandbox.operation": "harden" },
        extra: { sandboxId: sandbox.sandboxId },
      })
      throw new Error(COMPUTER_UNSECURED_ERROR, { cause: error })
    })
    shells.set(sandbox.sandboxId, shell)
  }
  return shell
}

// @e2b/desktop starts the display with `-ac`, which turns X access control off
// for the server's whole life: any local user could drive the screen, and
// `xhost -` can't undo it. Account computers start it the same way without
// `-ac`, and computerShell then admits only the desktop's user.
class AccountDesktop extends Sandbox {
  protected override async _start(
    display: string,
    opts?: SandboxOpts & { resolution?: [number, number]; dpi?: number }
  ) {
    this.display = display
    const [width, height] = opts?.resolution ?? [1024, 768]
    const xvfb = await this.commands.run(
      `Xvfb ${display} -screen 0 ${width}x${height}x24 -retro -dpi ${opts?.dpi ?? 96} -nolisten tcp -nolisten unix`,
      { background: true, timeoutMs: 0 }
    )
    await xvfb.disconnect()
    if (
      !(await this.waitAndVerify(
        `xdpyinfo -display ${display}`,
        (result) => result.exitCode === 0
      ))
    )
      throw new Error("Could not start Xvfb")
    const xfce = await this.commands.run("startxfce4", {
      background: true,
      timeoutMs: 0,
    })
    await xfce.disconnect()
    if (
      !(await this.waitAndVerify(
        "pgrep -x xfce4-session >/dev/null && pgrep -x xfwm4 >/dev/null && pgrep -x xfdesktop >/dev/null",
        (result) => result.exitCode === 0,
        60
      ))
    )
      throw new Error("Could not start XFCE")
  }
}

export async function createAccountSandbox(userId: string) {
  const creationId = randomUUID()
  let sandbox: Sandbox | undefined
  try {
    sandbox = await AccountDesktop.create(COMPUTER_TEMPLATE, {
      resolution: [1024, 768],
      ...providerOptions,
      metadata: { app: APP, userId, creationId },
      timeoutMs: IDLE_TIMEOUT_MS,
      lifecycle: { onTimeout: "pause", autoResume: false },
      network: { allowPublicTraffic: false },
    })
    // A computer whose shell could reach its desktop is never handed out
    await computerShell(sandbox)
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
    throw mapProviderError(error)
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

// Whether the provider has the computer paused. One that is gone counts as
// paused: there is nothing running to protect.
export async function isSandboxPaused(id: string) {
  try {
    return (await Sandbox.getInfo(id, providerOptions)).state === "paused"
  } catch (error) {
    if (error instanceof SandboxNotFoundError) return true
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
  cwd = DESKTOP_HOME,
  timeoutMs = 60_000,
  // Kills the command when aborted, instead of leaving it running
  signal?: AbortSignal,
  // Extra environment variables for this command only, such as the person's
  // saved API keys (lib/user-secrets.ts)
  envs?: Record<string, string>,
  // Who runs it: the shell user from computerShell for bots' commands
  user?: string
) {
  try {
    if (!signal)
      return await sandbox.commands.run(command, { cwd, timeoutMs, envs, user })
    signal.throwIfAborted()
    const handle = await sandbox.commands.run(command, {
      cwd,
      timeoutMs,
      envs,
      user,
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
