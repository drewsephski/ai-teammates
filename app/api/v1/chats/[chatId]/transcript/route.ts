import { apiRoute } from "@/lib/api"
import { loadTranscript } from "@/services/chats"

type Context = { params: Promise<{ chatId: string }> }

// The stored AI SDK UI messages, plus the stream cursor to resume from
export const GET = apiRoute<Context>(async ({ userId }, _request, { params }) =>
  loadTranscript(userId, (await params).chatId)
)
