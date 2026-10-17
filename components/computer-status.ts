import { DESKTOP_CLOSE } from "@/lib/sandbox-policy"

// At or below this many seconds left, even a paid account sees the clock
export const LOW_TIME_SECONDS = 5 * 60

// 272 -> "4:32"
export function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`
}

// The free allowance is small and one-time, so the clock is always there; a
// paid account sees it only when the period's time is nearly gone.
export function showComputerClock(
  tier: "free" | "paid" | null,
  remainingSeconds: number | null
) {
  if (tier === null || remainingSeconds === null) return false
  return tier === "free" || remainingSeconds <= LOW_TIME_SECONDS
}

// What a closed screen connection means. Anything else is a dropped connection
// the person can retry.
export function desktopCloseKind(code?: number) {
  if (code === DESKTOP_CLOSE.usageLimit.code) return "exhausted" as const
  if (code === DESKTOP_CLOSE.sessionEnded.code) return "ended" as const
  return "dropped" as const
}
