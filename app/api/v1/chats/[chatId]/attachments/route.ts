import { apiRoute } from "@/lib/api"
import { assertAttachmentChat } from "@/lib/chat-attachments"
import { readChatAttachment } from "@/lib/chat-attachment-upload"
import { storeChatAttachment } from "@/services/chat-attachments"
type Context = { params: Promise<{ chatId: string }> }
export const POST = apiRoute<Context>(
  async ({ userId }, request, { params }) => {
    const { chatId } = await params
    await assertAttachmentChat(userId, chatId)
    return {
      attachment: await storeChatAttachment(
        userId,
        chatId,
        await readChatAttachment(request)
      ),
    }
  }
)
