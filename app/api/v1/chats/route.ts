import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"

import { groupChatInsertSchema } from "@/db/schema"
import { apiRoute, readJson } from "@/lib/api"
import { publicChat } from "@/lib/api-shapes"
import { requestIdSchema } from "@/services/bots"
import { createGroupChat, findChat, listChats } from "@/services/chats"

// Most recent first, each with the bots in it
export const GET = apiRoute(async ({ userId }) => ({
  chats: (await listChats(userId)).map(publicChat),
}))

const createSchema = groupChatInsertSchema.extend({
  requestId: requestIdSchema,
})

// Creates a group chat. Direct chats come with their bot (POST /bots).
export const POST = apiRoute(async ({ userId }, request) => {
  const { requestId, ...values } = createSchema.parse(await readJson(request))
  const created = await createGroupChat(userId, values, requestId)
  revalidatePath("/", "layout")
  const chat = await findChat(userId, created.id)
  if (!chat) throw new Error("Chat not found")
  return NextResponse.json({ chat: publicChat(chat) }, { status: 201 })
})
