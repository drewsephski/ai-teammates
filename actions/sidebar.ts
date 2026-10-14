"use server"

import { auth } from "@clerk/nextjs/server"
import { and, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { db } from "@/db"
import { chats, sidebarPreferences } from "@/db/schema"
import { sidebarOrderSchema } from "@/lib/sidebar-order"

export async function reorderSidebarConversations(chatIds: string[]) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  const ids = sidebarOrderSchema.parse(chatIds)
  const owned = await db
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.userId, userId), inArray(chats.id, ids)))
  if (owned.length !== ids.length)
    throw new Error("Conversations changed. Try again.")
  await db
    .insert(sidebarPreferences)
    .values({ userId, conversationOrder: ids })
    .onConflictDoUpdate({
      target: sidebarPreferences.userId,
      set: { conversationOrder: ids },
    })
  revalidatePath("/", "layout")
}
