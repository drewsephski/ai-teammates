import { withSandboxLock } from "@/lib/sandbox-lock"

export type AppleAccountLock = <T>(
  userId: string,
  operation: (assertHeld: () => void) => Promise<T>
) => Promise<T>

// Dedicated session advisory lock: no row lock or transaction spans Apple,
// Clerk or account cleanup calls. Sign-in and deletion use the same namespace.
export const withAppleAccountLock: AppleAccountLock = (userId, operation) =>
  withSandboxLock(`apple-account:${userId}`, operation)
