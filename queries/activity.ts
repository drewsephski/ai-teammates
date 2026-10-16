import { auth } from "@clerk/nextjs/server"

import { getActivity, pendingApprovalCount } from "@/services/activity"

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
