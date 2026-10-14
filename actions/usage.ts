"use server"

import { auth } from "@clerk/nextjs/server"

import { usageKind, type UsageKind } from "@/db/schema"
import { getUsage } from "@/lib/usage"
import { isChatGPTSelected } from "@/lib/chatgpt-connection"

// Whether the signed-in user's billing period has any of this allowance left
export async function hasUsageLeft(kind: UsageKind) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  if (!usageKind.enumValues.includes(kind)) throw new Error("Unknown usage")
  if (kind === "ai" && (await isChatGPTSelected(userId))) return true

  const usage = await getUsage(userId)
  return !!usage && usage.remaining[kind] > 0
}
