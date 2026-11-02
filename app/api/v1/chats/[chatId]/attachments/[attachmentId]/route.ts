import { apiRoute } from "@/lib/api"
import {
  readStoredAttachment,
  discardChatAttachment,
} from "@/services/chat-attachments"
type Context = { params: Promise<{ chatId: string; attachmentId: string }> }
export const GET = apiRoute<Context>(
  async ({ userId }, _request, { params }) => {
    const { chatId, attachmentId } = await params
    const file = await readStoredAttachment(userId, chatId, attachmentId)
    return {
      attachment: {
        id: file.id,
        filename: file.filename,
        mediaType: file.mediaType,
        size: file.size,
        base64: file.bytes.toString("base64"),
      },
    }
  }
)

export const DELETE = apiRoute<Context>(
  async ({ userId }, _request, { params }) => {
    const { chatId, attachmentId } = await params
    await discardChatAttachment(userId, chatId, attachmentId)
    return { ok: true }
  }
)
