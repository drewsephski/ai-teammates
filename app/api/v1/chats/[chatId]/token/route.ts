import { apiRoute } from "@/lib/api"
import { mintChatAccessToken } from "@/services/chats"

type Context = { params: Promise<{ chatId: string }> }

// A fresh one-hour token for an existing session, read and write on this chat
export const POST = apiRoute<Context>(async (caller, _request, { params }) => ({
  publicAccessToken: await mintChatAccessToken(caller, (await params).chatId),
}))
