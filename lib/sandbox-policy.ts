// Leave a five-minute safety margin below Hobby's one-hour session ceiling.
export const MEMORY_FILE = "/home/user/MEMORY.md"
export const SESSION_LIMIT_MS = 55 * 60_000
export const IDLE_TIMEOUT_MS = 5 * 60_000

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
