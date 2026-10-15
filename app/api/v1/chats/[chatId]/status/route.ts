import { apiRoute } from "@/lib/api"
import { getChatTurnStatus } from "@/services/chats"

type Context = { params: Promise<{ chatId: string }> }

// Whether the chat's agent has picked up the latest turn: idle, queued,
// pending_version (waiting for a deploy), running or ended
export const GET = apiRoute<Context>(async ({ userId }, _request, { params }) =>
  getChatTurnStatus(userId, (await params).chatId)
)
