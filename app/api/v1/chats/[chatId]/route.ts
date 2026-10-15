import { revalidatePath } from "next/cache"

import { groupChatInsertSchema } from "@/db/schema"
import { apiRoute, readJson } from "@/lib/api"
import { publicChat } from "@/lib/api-shapes"
import { deleteGroupChat, findChat, updateGroupChat } from "@/services/chats"

type Context = { params: Promise<{ chatId: string }> }

export const GET = apiRoute<Context>(
  async ({ userId }, _request, { params }) => {
    const chat = await findChat(userId, (await params).chatId)
    if (!chat) throw new Error("Chat not found")
    return { chat: publicChat(chat) }
  }
)

// Renames a group chat and sets its members; direct chats can't be edited
export const PATCH = apiRoute<Context>(
  async ({ userId }, request, { params }) => {
    const { chatId } = await params
    const values = groupChatInsertSchema.parse(await readJson(request))
    await updateGroupChat(userId, chatId, values)
    revalidatePath("/", "layout")
    const chat = await findChat(userId, chatId)
    if (!chat) throw new Error("Chat not found")
    return { chat: publicChat(chat) }
  }
)

// Deletes a group chat; its bots stay. A direct chat goes with its bot.
export const DELETE = apiRoute<Context>(
  async ({ userId }, _request, { params }) => {
    await deleteGroupChat(userId, (await params).chatId)
    revalidatePath("/", "layout")
    return { ok: true }
  }
)
