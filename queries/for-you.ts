import { auth } from "@clerk/nextjs/server"
import * as Sentry from "@sentry/nextjs"

import { getForYou } from "@/services/for-you"

// Stored suggestions only; scanning happens from the client when stale
export async function getWorkspaceForYou() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  try {
    return await getForYou(userId)
  } catch (error) {
    Sentry.captureException(error, { tags: { surface: "for-you" } })
    return null
  }
}
