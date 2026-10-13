import {
  SandboxNotFoundError,
  type Sandbox,
  type SandboxInfo,
} from "@e2b/desktop"

import {
  IDLE_TIMEOUT_MS,
  SESSION_LIMIT_MS,
  sandboxTimeout,
} from "./sandbox-policy"

export class SandboxMissingError extends Error {
  constructor() {
    super(
      "This computer no longer exists. Reset it from the screen panel to start a new, empty computer. Its previous files and memory cannot be recovered."
    )
    this.name = "SandboxMissingError"
  }
}

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
      await deps.meter(info)
      if (info.state === "paused" && !resume) throw new Error("Computer paused")
      // Compare remaining session time, not the capped five-minute idle timeout.
      if (
        info.state === "running" &&
        sandboxTimeout(info.startedAt, Date.now(), leaseMs) < leaseMs
      ) {
        await pause(id)
        if (!resume) throw new Error("Computer paused at session limit")
      }
      const sandbox = await deps.connect(id, leaseMs)
      info = await getInfo(id)
      await sandbox.setTimeout(
        sandboxTimeout(info.startedAt, Date.now(), leaseMs)
      )
      await deps.meter(await getInfo(id))
      try {
        return await operation(sandbox)
      } finally {
        // Do not mask the tool error or encourage a duplicate write/command if
        // the operation succeeded but lease maintenance temporarily failed.
        try {
          const timeout = sandboxTimeout(info.startedAt)
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

  async function renewDesktop(id: string, startedAt: Date) {
    const check = async () => {
      const info = await getInfo(id)
      if (
        info.state !== "running" ||
        info.startedAt.getTime() !== startedAt.getTime()
      )
        throw new Error("Computer session ended; resume to reconnect")
      return info
    }
    // A tool already holds a sufficient lease. Never queue a viewer behind a
    // long command, shorten that command's lease, or wake a manually paused VM.
    await check()
    await deps.tryLock(id, async () => {
      const info = await check()
      await deps.meter(info)
      if (sandboxTimeout(info.startedAt) < IDLE_TIMEOUT_MS) {
        await pause(id)
        throw new Error("Computer paused at session limit")
      }
      const sandbox = await deps.connect(id, IDLE_TIMEOUT_MS)
      await sandbox.setTimeout(sandboxTimeout(info.startedAt))
    })
  }

  return {
    getInfo,
    run,
    renewDesktop,
    pause: (id: string) => deps.lock(id, () => pause(id)),
  }
}
