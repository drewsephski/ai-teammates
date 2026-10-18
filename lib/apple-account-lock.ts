import type { Pool } from "pg"

import { AppleAccountBusyError } from "@/lib/apple-account-policy"
import { acquireSessionLock, createSessionLockPool } from "@/lib/session-lock"

export type AppleAccountLock = <T>(
  userId: string,
  operation: (assertHeld: () => void) => Promise<T>
) => Promise<T>

const globalForLocks = globalThis as unknown as { appleAccountLockPool?: Pool }

function getPool() {
  // Deletion nests sandbox leases for ChatGPT disconnect and computer removal.
  // Its outer lease must never consume those leases' connection capacity.
  return (globalForLocks.appleAccountLockPool ??= createSessionLockPool(
    "ai-teammates-apple-account-lock",
    10
  ))
}

export const withAppleAccountLock: AppleAccountLock = async (
  userId,
  operation
) => {
  const result = await acquireSessionLock(
    getPool(),
    `apple-account:${userId}`,
    operation,
    10_000
  )
  if (!result.acquired) throw new AppleAccountBusyError()
  return result.value
}
