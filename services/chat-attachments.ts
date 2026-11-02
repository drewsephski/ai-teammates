import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { chats, chatTranscripts } from "@/db/schema"
import {
  assertAttachmentChat,
  storeChatAttachment,
} from "@/lib/chat-attachments"
import { HttpError } from "@/lib/api-response"

export {
  storeChatAttachment,
  readStoredAttachment,
  discardChatAttachment,
} from "@/lib/chat-attachments"

export async function attachConversation(
  userId: string,
  chatId: string,
  sourceChatId: string
) {
  await assertAttachmentChat(userId, chatId)
  await assertAttachmentChat(userId, sourceChatId)
  const source = await db.query.chats.findFirst({
    columns: { name: true },
    where: and(eq(chats.id, sourceChatId), eq(chats.userId, userId)),
    with: {
      members: { columns: {}, with: { bot: { columns: { name: true } } } },
    },
  })
  const [transcript] = await db
    .select({ entries: chatTranscripts.entries })
    .from(chatTranscripts)
    .where(eq(chatTranscripts.chatId, sourceChatId))
  const lines = (transcript?.entries ?? []).slice(-30).flatMap((entry) => {
    const message = (
      entry as {
        message?: { role?: string; parts?: { type: string; text?: string }[] }
      }
    ).message
    if (!message || (message.role !== "user" && message.role !== "assistant"))
      return []
    const text = message.parts
      ?.filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("\n")
      .trim()
    return text
      ? [
          `${message.role === "user" ? "You" : "Teammate"}: ${text.slice(0, 6000)}`,
        ]
      : []
  })
  if (!lines.length)
    throw new HttpError(
      400,
      "invalid_request",
      "This conversation has no messages to attach yet"
    )
  const text = `Snapshot of recent messages from another conversation. It may omit older messages and attachments.\n\n${lines.join("\n\n").slice(-50000)}`
  const filename = `${(source?.name ?? (source?.members.map((member) => member.bot.name).join(", ") || "Conversation")).replace(/[\x00-\x1f/\\]/g, " ").slice(0, 140)}.txt`
  return storeChatAttachment(userId, chatId, {
    filename,
    mediaType: "text/plain",
    bytes: Buffer.from(text),
  })
}
