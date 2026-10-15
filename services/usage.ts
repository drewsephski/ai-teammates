import { usageKind, type UsageKind } from "@/db/schema"
import { getUsage } from "@/lib/usage"
import { getChatGPTStatus, isChatGPTSelected } from "@/lib/chatgpt-connection"

// Whether the user's billing period has any of this allowance left
export async function hasUsageLeft(userId: string, kind: UsageKind) {
  if (!usageKind.enumValues.includes(kind)) throw new Error("Unknown usage")
  if (kind === "ai" && (await isChatGPTSelected(userId))) return true

  const usage = await getUsage(userId)
  return !!usage && usage.remaining[kind] > 0
}

// The usage page's numbers: plan, period, and what is used and left
export async function getUsageSummary(userId: string) {
  const [usage, chatGPT] = await Promise.all([
    getUsage(userId),
    getChatGPTStatus(userId),
  ])
  return {
    tier: usage.tier,
    period: usage.period,
    limits: usage.limits,
    used: usage.used,
    remaining: usage.remaining,
    chatGPTSelected: chatGPT.enabled,
    // What the server can do with ChatGPT, so apps never offer more than it
    // supports: sign-in (available) and plan-backed replies (planAvailable)
    chatGPT: {
      available: chatGPT.available,
      planAvailable: chatGPT.planAvailable,
      needsReconnect: chatGPT.needsReconnect,
    },
  }
}
