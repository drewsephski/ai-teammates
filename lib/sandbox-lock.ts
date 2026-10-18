import type { Pool } from "pg"

import { acquireSessionLock, createSessionLockPool } from "@/lib/session-lock"
import { SANDBOX_BUSY_ERROR } from "@/lib/sandbox-policy"

const globalForLocks = globalThis as unknown as { sandboxLockPool?: Pool }

function getPool() {
  return (globalForLocks.sandboxLockPool ??= createSessionLockPool(
    "ai-teammates-sandbox-lock",
    10
  ))
}

export class SandboxBusyError extends Error {
  constructor() {
    super(SANDBOX_BUSY_ERROR)
    this.name = "SandboxBusyError"
  }
}

export async function withSandboxLock<T>(
  id: string,
  operation: (assertHeld: () => void) => Promise<T>
) {
  const result = await acquireSessionLock(getPool(), id, operation, 10_000)
  if (!result.acquired) throw new SandboxBusyError()
  return result.value
}

export function tryWithSandboxLock<T>(
  id: string,
  operation: (assertHeld: () => void) => Promise<T>
) {
  return acquireSessionLock(getPool(), id, operation, 0)
}
