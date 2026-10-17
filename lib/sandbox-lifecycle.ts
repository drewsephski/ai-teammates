import {
  SandboxNotFoundError,
  type Sandbox,
  type SandboxInfo,
} from "@e2b/desktop"

import {
  IDLE_TIMEOUT_MS,
  SESSION_LIMIT_MS,
  allowanceMs,
  computerTimeUsedUpMessage,
  idleTimeoutMs,
  sandboxTimeout,
} from "./sandbox-policy"

export class SandboxMissingError extends Error {
  constructor() {
    super(
      "This computer no longer exists. Reset it from the screen panel to start a new, empty computer. Its previous files cannot be recovered."
    )
    this.name = "SandboxMissingError"
  }
}

// The computer's owner has no computer time left. The computer is paused.
export class ComputerAllowanceSpentError extends Error {
  constructor(readonly tier?: "free" | "paid") {
    super(computerTimeUsedUpMessage(tier))
    this.name = "ComputerAllowanceSpentError"
  }
}

// The viewer's session is over: paused, rotated at the session cap, or replaced
export class ComputerSessionEndedError extends Error {
  constructor(message = "Computer session ended; resume to reconnect") {
    super(message)
    this.name = "ComputerSessionEndedError"
  }
}

export type ComputerAllowance = { seconds: number; tier: "free" | "paid" }

type Dependencies = {
  getInfo: (id: string) => Promise<SandboxInfo>
  connect: (id: string, timeoutMs: number) => Promise<Sandbox>
  pause: (id: string) => Promise<unknown>
  meter: (info: SandboxInfo) => Promise<void>
  lock: <T>(id: string, operation: () => Promise<T>) => Promise<T>
  tryLock: <T>(
    id: string,
    operation: () => Promise<T>
  ) => Promise<{ acquired: false } | { acquired: true; value: T }>
  report: (error: unknown, id: string) => void
  // Seconds the computer's owner has left, read after metering. Optional: null
  // (or a failure) means unknown, which keeps the default five-minute idle.
  allowance?: (id: string) => Promise<ComputerAllowance | null>
}

// Provider side effects and billing are separate: each meter call commits before
// the next provider call, and maintenance never turns a successful tool into a retry.
export function createSandboxLifecycle(deps: Dependencies) {
  async function getInfo(id: string) {
    try {
      return await deps.getInfo(id)
    } catch (error) {
      if (error instanceof SandboxNotFoundError) throw new SandboxMissingError()
      throw error
    }
  }

  async function pause(id: string) {
    await deps.pause(id)
    await deps.meter(await getInfo(id))
  }

  async function readAllowance(id: string) {
    if (!deps.allowance) return null
    try {
      return await deps.allowance(id)
    } catch (error) {
      // An unknown allowance keeps the default idle time rather than failing
      deps.report(error, id)
      return null
    }
  }

  // Spent: stop the meter now, then say so
  async function pauseSpent(id: string, allowance: ComputerAllowance) {
    try {
      await pause(id)
    } catch (error) {
      deps.report(error, id)
    }
    return new ComputerAllowanceSpentError(allowance.tier)
  }

  async function run<T>(
    id: string,
    operation: (sandbox: Sandbox) => Promise<T>,
    leaseMs = IDLE_TIMEOUT_MS,
    resume = true
  ) {
    if (!Number.isFinite(leaseMs) || leaseMs <= 0 || leaseMs > SESSION_LIMIT_MS)
      throw new Error("Invalid computer lease")
    return deps.lock(id, async () => {
      let info = await getInfo(id)
      const sampledAt = Date.now()
      await deps.meter(info)
      // Metered just now, so this is what the owner has left. A computer may
      // never run past it: the provider pauses it at that moment on its own.
      const allowance = await readAllowance(id)
      if (allowance && allowance.seconds <= 0) {
        if (info.state === "running") throw await pauseSpent(id, allowance)
        throw new ComputerAllowanceSpentError(allowance.tier)
      }
      const lease = Math.min(leaseMs, allowanceMs(allowance?.seconds))
      if (info.state === "paused" && !resume) throw new Error("Computer paused")
      // Compare remaining session time, not the capped five-minute idle timeout.
      if (
        info.state === "running" &&
        sandboxTimeout(info.startedAt, Date.now(), lease) < lease
      ) {
        await pause(id)
        if (!resume) throw new Error("Computer paused at session limit")
      }
      const sandbox = await deps.connect(id, lease)
      info = await getInfo(id)
      await sandbox.setTimeout(
        sandboxTimeout(info.startedAt, Date.now(), lease)
      )
      await deps.meter(await getInfo(id))
      try {
        return await operation(sandbox)
      } finally {
        // Do not mask the tool error or encourage a duplicate write/command if
        // the operation succeeded but lease maintenance temporarily failed.
        try {
          // Seconds left now, without another provider read: the computer ran
          // the whole time since the meter above. Rounded against the person.
          const left = allowance
            ? allowance.seconds - Math.ceil((Date.now() - sampledAt) / 1000)
            : null
          const timeout = Math.min(
            sandboxTimeout(info.startedAt, Date.now(), idleTimeoutMs(left)),
            allowanceMs(left)
          )
          if (timeout < 1000) await deps.pause(id)
          else await sandbox.setTimeout(timeout)
        } catch (error) {
          deps.report(error, id)
        }
        try {
          await deps.meter(await getInfo(id))
        } catch (error) {
          deps.report(error, id)
        }
      }
    })
  }

  // Returns the seconds the owner has left, or null when unknown or when a
  // running tool holds the lock (it already holds a sufficient lease).
  async function renewDesktop(id: string, startedAt: Date) {
    const check = async () => {
      const info = await getInfo(id)
      if (
        info.state !== "running" ||
        info.startedAt.getTime() !== startedAt.getTime()
      )
        throw new ComputerSessionEndedError()
      return info
    }
    // A tool already holds a sufficient lease. Never queue a viewer behind a
    // long command, shorten that command's lease, or wake a manually paused VM.
    await check()
    let remainingSeconds: number | null = null
    await deps.tryLock(id, async () => {
      const info = await check()
      await deps.meter(info)
      const allowance = await readAllowance(id)
      if (allowance && allowance.seconds <= 0)
        throw await pauseSpent(id, allowance)
      remainingSeconds = allowance?.seconds ?? null
      const idle = idleTimeoutMs(remainingSeconds)
      if (sandboxTimeout(info.startedAt, Date.now(), idle) < idle) {
        await pause(id)
        throw new ComputerSessionEndedError("Computer paused at session limit")
      }
      const cap = allowanceMs(remainingSeconds)
      const sandbox = await deps.connect(id, Math.min(idle, cap))
      await sandbox.setTimeout(
        Math.min(sandboxTimeout(info.startedAt, Date.now(), idle), cap)
      )
    })
    return remainingSeconds as number | null
  }

  return {
    getInfo,
    run,
    renewDesktop,
    pause: (id: string) => deps.lock(id, () => pause(id)),
  }
}
