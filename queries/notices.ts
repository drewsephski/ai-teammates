import { auth } from "@clerk/nextjs/server"

import { listNotices } from "@/services/notices"

export async function getSignedInNotices() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return listNotices(userId)
}
