import { usageKind, type AIProviderChoice, type UsageKind } from "@/db/schema"
import { getUsage } from "@/lib/usage"
import { usesOwnModel } from "@/lib/ai-provider"
import { getChatGPTStatus } from "@/lib/chatgpt-connection"
import { listModelKeys } from "@/lib/model-keys"

// Whether the user's billing period has any of this allowance left
export async function hasUsageLeft(userId: string, kind: UsageKind) {
  if (!usageKind.enumValues.includes(kind)) throw new Error("Unknown usage")
  if (kind === "ai" && (await usesOwnModel(userId))) return true

  const usage = await getUsage(userId)
  return !!usage && usage.remaining[kind] > 0
}

// The usage page's numbers: plan, period, and what is used and left
export async function getUsageSummary(userId: string) {
  const [usage, chatGPT, modelKeys] = await Promise.all([
    // Fresh from Clerk: this is where people look right after upgrading
    getUsage(userId, { fresh: true }),
    getChatGPTStatus(userId),
    listModelKeys(userId),
  ])
  const selectedKey = modelKeys.find((key) => key.selected)
  const aiProvider: "chatgpt" | AIProviderChoice = chatGPT.enabled
    ? "chatgpt"
    : (selectedKey?.provider ?? "krafty")
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
    // Who pays for replies: krafty, chatgpt, or the provider of a saved key
    aiProvider,
    modelKeys,
  }
}
