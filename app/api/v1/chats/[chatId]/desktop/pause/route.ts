import { apiRoute } from "@/lib/api"
import { pauseDesktop } from "@/services/chats"

type Context = { params: Promise<{ chatId: string }> }

// Pauses the bot's computer so it stops using sandbox time
export const POST = apiRoute<Context>(
  async ({ userId }, _request, { params }) => {
    await pauseDesktop(userId, (await params).chatId)
    return { ok: true }
  }
)
