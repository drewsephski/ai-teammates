import { revalidatePath } from "next/cache"
import { z } from "zod"

import { apiRoute, readJson } from "@/lib/api"
import { publicBot, publicChat } from "@/lib/api-shapes"
import { pinnedBotOrderSchema } from "@/lib/pinned-bot-order"
import { sidebarOrderSchema, sidebarSections } from "@/lib/sidebar-order"
import { listBots, reorderPinnedBots } from "@/services/bots"
import {
  getSidebarConversationOrder,
  listChats,
  reorderSidebarConversations,
} from "@/services/chats"

// The web sidebar's sections: pinned bot tiles, then ordered conversations
export const GET = apiRoute(async ({ userId }) => {
  const [chats, bots, order] = await Promise.all([
    listChats(userId),
    listBots(userId),
    getSidebarConversationOrder(userId),
  ])
  const { pinned, conversations } = sidebarSections(chats, bots, order)
  return {
    pinned: pinned.map(({ bot, chat, chatIds }) => ({
      bot: publicBot(bot),
      chatId: chat.id,
      chatIds,
    })),
    conversations: conversations.map(publicChat),
  }
})

const orderSchema = z
  .object({
    pinnedBotIds: pinnedBotOrderSchema.optional(),
    conversationIds: sidebarOrderSchema.optional(),
  })
  .refine(
    (body) => body.pinnedBotIds || body.conversationIds,
    "Send pinnedBotIds or conversationIds."
  )

// Saves a new order for either section, like dragging in the web sidebar
export const PUT = apiRoute(async ({ userId }, request) => {
  const body = orderSchema.parse(await readJson(request))
  if (body.pinnedBotIds) await reorderPinnedBots(userId, body.pinnedBotIds)
  if (body.conversationIds)
    await reorderSidebarConversations(userId, body.conversationIds)
  revalidatePath("/", "layout")
  return { ok: true }
})
