import { apiRoute } from "@/lib/api"
import { getChatOrigin } from "@/services/chats"

type Context = { params: Promise<{ chatId: string }> }

// The chat this one was delegated from, if it is still this user's:
// { origin: { chatId, name } | null }
export const GET = apiRoute<Context>(
  async ({ userId }, _request, { params }) => ({
    origin: await getChatOrigin(userId, (await params).chatId),
  })
)
