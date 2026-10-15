import { usageKind, type UsageKind } from "@/db/schema"
import { getUsage } from "@/lib/usage"
import { isChatGPTSelected } from "@/lib/chatgpt-connection"

// Whether the user's billing period has any of this allowance left
export async function hasUsageLeft(userId: string, kind: UsageKind) {
  if (!usageKind.enumValues.includes(kind)) throw new Error("Unknown usage")
  if (kind === "ai" && (await isChatGPTSelected(userId))) return true

  const usage = await getUsage(userId)
  return !!usage && usage.remaining[kind] > 0
}

// The usage page's numbers: plan, period, and what is used and left
export async function getUsageSummary(userId: string) {
  const [usage, chatGPTSelected] = await Promise.all([
    getUsage(userId),
    isChatGPTSelected(userId),
  ])
  return {
    tier: usage.tier,
    period: usage.period,
    limits: usage.limits,
    used: usage.used,
    remaining: usage.remaining,
    chatGPTSelected,
  }
}
