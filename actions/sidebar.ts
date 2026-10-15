"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import * as service from "@/services/chats"

export async function reorderSidebarConversations(chatIds: string[]) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  await service.reorderSidebarConversations(userId, chatIds)
  revalidatePath("/", "layout")
}
