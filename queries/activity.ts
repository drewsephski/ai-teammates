import { auth } from "@clerk/nextjs/server"
import { headers } from "next/headers"

import { publicOrigin } from "@/lib/api-response"
import { inboundEmailDomain } from "@/lib/bot-triggers"
import { getActivity, pendingApprovalCount } from "@/services/activity"
import { getSlackStatus } from "@/services/slack"
import { listTriggers } from "@/services/triggers"

export async function getSignedInActivity() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return getActivity(userId)
}

// For the sidebar badge
export async function getPendingApprovalCount() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return pendingApprovalCount(userId)
}

// Event triggers and the Slack connection, for the Activity page
export async function getSignedInChannels() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  const [triggers, slack] = await Promise.all([
    listTriggers(userId, publicOrigin(await headers())),
    getSlackStatus(userId),
  ])
  return { triggers, slack, emailAvailable: !!inboundEmailDomain() }
}
