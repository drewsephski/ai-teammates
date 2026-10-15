import { auth } from "@clerk/nextjs/server"

import { listBots } from "@/services/bots"
import { listChats } from "@/services/chats"

// The signed-in user's chats, most recent first, each with the bots in it
export async function getChats() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return listChats(userId)
}

// The signed-in user's bots, oldest first
export async function getBots() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return listBots(userId)
}

export type { ChatWithBots } from "@/services/chats"
