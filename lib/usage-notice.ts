import { format } from "date-fns"

import type { UsageKind } from "../db/schema"
import type { PlanTier } from "./billing-policy"

// Below this share of an allowance the chat starts saying how much is left
export const LOW_USAGE_RATIO = 0.2

export type UsageNoticeLevel = "low" | "out"
export type UsageNotice = { kind: UsageKind; level: UsageNoticeLevel }

type UsageSnapshot = {
  tier: PlanTier
  period: { end: Date | null }
  limits: Record<UsageKind, number>
  remaining: Record<UsageKind, number>
}

// The one allowance worth mentioning, if any: a spent one before a low one.
// ChatGPT-backed replies don't draw on the AI allowance, so it isn't mentioned.
export function usageNotice(
  usage: UsageSnapshot,
  { chatgptSelected = false }: { chatgptSelected?: boolean } = {}
): UsageNotice | undefined {
  const kinds: UsageKind[] = chatgptSelected ? ["sandbox"] : ["ai", "sandbox"]
  const notices = kinds.flatMap((kind): UsageNotice[] => {
    const limit = usage.limits[kind]
    const left = usage.remaining[kind]
    // An allowance the plan doesn't include can't run out
    if (limit <= 0) return []
    if (left <= 0) return [{ kind, level: "out" }]
    if (left <= limit * LOW_USAGE_RATIO) return [{ kind, level: "low" }]
    return []
  })
  return notices.find((notice) => notice.level === "out") ?? notices[0]
}

const hours = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 })

function timeLeft(seconds: number) {
  if (seconds >= 3600) return `${hours.format(seconds / 3600)} computer hours`
  const minutes = Math.max(1, Math.floor(seconds / 60))
  return `${minutes} computer minute${minutes === 1 ? "" : "s"}`
}

const utcDay = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  timeZone: "UTC",
})

// When the period ends, as "December 1". The free period ends at midnight
// UTC on the 1st, which is still the 30th or 31st in the Americas, so it's
// named in UTC to match "renews on the 1st".
export function periodEndLabel(usage: {
  tier: PlanTier
  period: { end: Date | null }
}) {
  const { end } = usage.period
  if (!end) return null
  return usage.tier === "free" ? utcDay.format(end) : format(end, "MMMM d")
}

export function usageNoticeCopy(notice: UsageNotice, usage: UsageSnapshot) {
  const paid = usage.tier === "paid"
  const endLabel = periodEndLabel(usage)
  const until = endLabel ? ` until ${endLabel}` : ""
  const left = usage.remaining[notice.kind]
  // AI usage is shown as a share, never in dollars
  const share = Math.max(1, Math.round((left / usage.limits.ai) * 100))
  const message =
    notice.kind === "ai"
      ? notice.level === "out"
        ? paid
          ? `Your AI usage is used up${until}.`
          : `This month's free AI usage is used up${until}.`
        : paid
          ? `${share}% of your AI usage left this period.`
          : `${share}% of this month's free AI usage left.`
      : notice.level === "out"
        ? paid
          ? `Computer hours are used up${until}.`
          : `This month's free computer time is used up${until}.`
        : paid
          ? `${timeLeft(left)} left this period.`
          : `${timeLeft(left)} of free computer time left this month.`

  return {
    message,
    action: paid
      ? { label: "View usage", href: "/usage" }
      : { label: "Try Pro free", href: "/pricing" },
  }
}
