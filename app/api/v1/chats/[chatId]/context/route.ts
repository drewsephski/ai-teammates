import { z } from "zod"
import { apiRoute, readJson } from "@/lib/api"
import { attachConversation } from "@/services/chat-attachments"
const schema = z.object({ sourceChatId: z.string().min(1).max(200) })
type Context = { params: Promise<{ chatId: string }> }
export const POST = apiRoute<Context>(
  async ({ userId }, request, { params }) => {
    const { chatId } = await params
    const { sourceChatId } = schema.parse(await readJson(request))
    return {
      attachment: await attachConversation(userId, chatId, sourceChatId),
    }
  }
)
