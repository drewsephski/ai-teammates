import { auth } from "@clerk/nextjs/server"

import * as service from "@/services/chats"

export async function getSidebarConversationOrder() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return service.getSidebarConversationOrder(userId)
}
