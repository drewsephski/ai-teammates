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
    // Free plans have no computer hours to run out of
    if (limit <= 0) return []
    if (left <= 0) return [{ kind, level: "out" }]
    if (left <= limit * LOW_USAGE_RATIO) return [{ kind, level: "low" }]
    return []
  })
  return notices.find((notice) => notice.level === "out") ?? notices[0]
}

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})
const hours = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 })

function timeLeft(seconds: number) {
  if (seconds >= 3600) return `${hours.format(seconds / 3600)} computer hours`
  const minutes = Math.max(1, Math.floor(seconds / 60))
  return `${minutes} computer minute${minutes === 1 ? "" : "s"}`
}

export function usageNoticeCopy(notice: UsageNotice, usage: UsageSnapshot) {
  const paid = usage.tier === "paid"
  const until = usage.period.end
    ? ` until ${format(usage.period.end, "MMMM d")}`
    : ""
  const left = usage.remaining[notice.kind]
  const message =
    notice.kind === "ai"
      ? notice.level === "out"
        ? paid
          ? `Your AI allowance is used up${until}.`
          : "Your free AI allowance is used up."
        : paid
          ? `${dollars.format(left / 1_000_000)} of AI usage left this period.`
          : `${dollars.format(left / 1_000_000)} of your free AI allowance left.`
      : notice.level === "out"
        ? `Computer hours are used up${until}.`
        : `${timeLeft(left)} left this period.`

  return {
    message,
    action: paid
      ? { label: "View usage", href: "/usage" }
      : { label: "Upgrade", href: "/pricing" },
  }
}
