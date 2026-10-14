import { auth } from "@clerk/nextjs/server"
import { eq } from "drizzle-orm"

import { db } from "@/db"
import { sidebarPreferences } from "@/db/schema"

export async function getSidebarConversationOrder() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  const [preferences] = await db
    .select({ order: sidebarPreferences.conversationOrder })
    .from(sidebarPreferences)
    .where(eq(sidebarPreferences.userId, userId))
  return preferences?.order ?? []
}
