// Leave a five-minute safety margin below Hobby's one-hour session ceiling.
export const SESSION_LIMIT_MS = 55 * 60_000
export const IDLE_TIMEOUT_MS = 5 * 60_000
// The shortest idle time before a computer with little allowance left pauses
export const MIN_IDLE_TIMEOUT_MS = 30_000
// At or below this many seconds left, a turn's end pauses the computer at once
export const LOW_ALLOWANCE_SECONDS = 60
// Free-plan turns may make this many computer tool calls (the lead enforces it)
export const FREE_COMPUTER_CALLS_PER_TURN = 20
// "Computers are busy": E2B's rate limit, quota or concurrent-sandbox cap
export const COMPUTERS_BUSY_ERROR =
  "Computers are busy right now. Try again in a few minutes."
// The WebSocket close code and reason the gateway sends a viewer whose
// computer time ran out, and one whose session ended (paused, rotated or gone)
export const DESKTOP_CLOSE = {
  usageLimit: { code: 4429, reason: "usage_limit" },
  sessionEnded: { code: 4410, reason: "session_ended" },
} as const
// Another operation holds the computer's lock (lib/sandbox-lock.ts)
export const SANDBOX_BUSY_ERROR =
  "The computer is busy with another operation. Try again shortly."

export function sandboxTimeout(
  startedAt: Date,
  now = Date.now(),
  leaseMs = IDLE_TIMEOUT_MS
) {
  return Math.max(
    0,
    Math.min(leaseMs, startedAt.getTime() + SESSION_LIMIT_MS - now)
  )
}

export function runningSeconds(startedAt: Date, endAt: Date, now = Date.now()) {
  return Math.max(
    0,
    Math.floor((Math.min(endAt.getTime(), now) - startedAt.getTime()) / 1000)
  )
}

export function sandboxPath(path: string) {
  if (path === "~") return "/home/user"
  if (path.startsWith("~/")) return `/home/user/${path.slice(2)}`
  return path.startsWith("/") ? path : `/home/user/${path}`
}

// Idle time before the provider pauses a computer: five minutes, but a quarter
// of what is left (never under 30 seconds) once the allowance is small, so one
// call can't leave a free account idling through its whole allowance.
// `null` means the allowance is unknown.
export function idleTimeoutMs(remainingSeconds: number | null | undefined) {
  if (remainingSeconds == null || !Number.isFinite(remainingSeconds))
    return IDLE_TIMEOUT_MS
  const quarter = Math.floor((Math.max(0, remainingSeconds) * 1000) / 4)
  return Math.max(MIN_IDLE_TIMEOUT_MS, Math.min(IDLE_TIMEOUT_MS, quarter))
}

// The longest the provider may keep a computer running before the allowance is
// gone. The provider pauses it at that moment even if nothing checks again.
export function allowanceMs(remainingSeconds: number | null | undefined) {
  if (remainingSeconds == null || !Number.isFinite(remainingSeconds))
    return Infinity
  return Math.max(0, Math.floor(remainingSeconds * 1000))
}

// How often the gateway renews a viewer's computer: well inside the idle time
export function desktopHeartbeatMs(
  remainingSeconds: number | null | undefined
) {
  return Math.max(
    10_000,
    Math.min(30_000, Math.floor(idleTimeoutMs(remainingSeconds) / 3))
  )
}

// What a person sees when the computer allowance is spent. The free allowance
// is a one-time allowance; the paid one renews with the billing period.
export function computerTimeUsedUpMessage(tier?: "free" | "paid") {
  if (tier === "free")
    return "Your free computer time is used up. Upgrade to keep using the computer."
  if (tier === "paid")
    return "Your computer time for this billing period is used up. It resets when your next period starts."
  return "Your computer time is used up."
}

export const COMPUTER_TIME_USED_UP_ERRORS = [
  computerTimeUsedUpMessage("free"),
  computerTimeUsedUpMessage("paid"),
  computerTimeUsedUpMessage(),
] as const

// Provider failures that mean capacity, not a bug: a rate limit, a quota or
// the cap on sandboxes running at once. Duck-typed on name and status code so
// it holds for every E2B error class and in tests.
export function isProviderCapacityError(error: unknown) {
  if (typeof error !== "object" || error === null) return false
  const { name, statusCode, message } = error as {
    name?: unknown
    statusCode?: unknown
    message?: unknown
  }
  if (name === "RateLimitError" || name === "ServiceBusyError") return true
  if (statusCode === 429 || statusCode === 503) return true
  return (
    typeof message === "string" &&
    /concurrent|quota|rate.?limit|too many (requests|sandboxes)/i.test(message)
  )
}
