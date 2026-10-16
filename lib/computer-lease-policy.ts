// Pure rules for the account computer's lease. One turn holds the computer at a
// time, so the person's bots take turns instead of fighting over the screen.

// The lease expires this long after the holding turn's last computer call
export const LEASE_TTL_MS = 2 * 60_000
// How long a tool waits for another turn's lease before it returns busy
export const LEASE_WAIT_MS = 60_000
export const LEASE_POLL_MS = 2_000

export type Lease = {
  runKey: string | null
  botId: string | null
  chatId: string | null
  expiresAt: Date | null
}

// runKey is the turn's ledger key, ai:<runId>:<turn>
export type LeaseHolder = { runKey: string; botId: string; chatId: string }

export function leaseDecision(
  lease: Lease,
  me: LeaseHolder,
  now: number
): "take" | "renew" | "wait" {
  if (lease.runKey === me.runKey) return "renew"
  if (!lease.runKey || !lease.expiresAt || lease.expiresAt.getTime() <= now)
    return "take"
  return "wait"
}

// `holdMs` covers a call that runs longer than the TTL, such as a long shell
// command, so the lease can't lapse while that call is still running
export function leaseExpiry(now: number, holdMs = 0) {
  return new Date(now + Math.max(0, holdMs) + LEASE_TTL_MS)
}

export function busyResult(name: string) {
  return { status: "busy" as const, heldBy: name }
}

// Another turn holds the person's computer. Computer tools return this in
// place of their declared output, so renderers check with isComputerBusy.
export type ComputerBusy = ReturnType<typeof busyResult>

export function isComputerBusy(output: unknown): output is ComputerBusy {
  return (
    typeof output === "object" &&
    output !== null &&
    (output as { status?: unknown }).status === "busy"
  )
}
