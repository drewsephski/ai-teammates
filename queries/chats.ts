import { auth } from "@clerk/nextjs/server"

import { findChat } from "@/services/chats"

// One of the signed-in user's chats with the bots in it, or null if it isn't theirs
export async function getChat(chatId: string) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return findChat(userId, chatId)
}
