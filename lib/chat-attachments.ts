import { and, eq, inArray, lt, sql } from "drizzle-orm"
import { nanoid } from "nanoid"
import type { ModelMessage } from "ai"
import { db } from "@/db"
import { chatAttachments, chats, chatTranscripts } from "@/db/schema"
import { HttpError } from "@/lib/api-response"
import { ensureChatContentKey } from "@/lib/chat-content-key"
import { openMessage, sealMessage } from "@/lib/chat-content-seal"
import {
  attachmentId,
  attachmentNameSchema,
  attachmentTypeSchema,
  attachmentUrl,
  MAX_ATTACHMENTS,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_MESSAGE_ATTACHMENT_BYTES,
  validAttachmentBytes,
} from "@/lib/chat-attachment-policy"

export async function assertAttachmentChat(userId: string, chatId: string) {
  const [chat] = await db
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
  if (!chat) throw new Error("Chat not found")
}

export async function storeChatAttachment(
  userId: string,
  chatId: string,
  input: { filename: string; mediaType: string; bytes: Uint8Array }
) {
  await assertAttachmentChat(userId, chatId)
  const filename = attachmentNameSchema.parse(input.filename)
  const mediaType = attachmentTypeSchema.parse(input.mediaType)
  if (!validAttachmentBytes(input.bytes, mediaType))
    throw new HttpError(
      415,
      "unsupported_media_type",
      "Choose a supported file up to 10 MB"
    )
  const key = await ensureChatContentKey(chatId)
  if (!key) throw new Error("Chat not found")
  const id = nanoid()
  const sealed = sealMessage(
    {
      id,
      role: "user",
      parts: [
        { type: "text", text: Buffer.from(input.bytes).toString("base64") },
      ],
    },
    chatId,
    key
  ).parts
  await db.transaction(async (tx) => {
    // Serialize quota checks across parallel uploads to the same chat.
    await tx
      .select({ id: chats.id })
      .from(chats)
      .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
      .for("update")
    // Reclaim abandoned draft uploads, including uploads whose response was
    // lost. Sent files remain protected by the persisted transcript.
    const [transcript] = await tx
      .select({ entries: chatTranscripts.entries })
      .from(chatTranscripts)
      .where(eq(chatTranscripts.chatId, chatId))
    const saved = JSON.stringify(transcript?.entries ?? [])
    const stale = await tx
      .select({ id: chatAttachments.id })
      .from(chatAttachments)
      .where(
        and(
          eq(chatAttachments.chatId, chatId),
          lt(
            chatAttachments.createdAt,
            new Date(Date.now() - 24 * 60 * 60 * 1000)
          )
        )
      )
    const abandoned = stale
      .filter((file) => !saved.includes(attachmentUrl(file.id)))
      .map((file) => file.id)
    if (abandoned.length)
      await tx
        .delete(chatAttachments)
        .where(
          and(
            eq(chatAttachments.chatId, chatId),
            inArray(chatAttachments.id, abandoned)
          )
        )
    const [usage] = await tx
      .select({
        bytes: sql<number>`coalesce(sum(${chatAttachments.size}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(chatAttachments)
      .where(eq(chatAttachments.chatId, chatId))
    if (
      Number(usage.bytes) + input.bytes.length > MAX_CHAT_ATTACHMENT_BYTES ||
      Number(usage.count) >= 100
    )
      throw new HttpError(
        413,
        "payload_too_large",
        "This chat has reached its attachment limit. Start a new chat."
      )
    await tx.insert(chatAttachments).values({
      id,
      chatId,
      filename,
      mediaType,
      size: input.bytes.length,
      sealed,
    })
  })
  return {
    id,
    filename,
    mediaType,
    size: input.bytes.length,
    url: attachmentUrl(id),
  }
}

export async function readStoredAttachment(
  userId: string,
  chatId: string,
  id: string
) {
  await assertAttachmentChat(userId, chatId)
  const [file] = await db
    .select()
    .from(chatAttachments)
    .where(and(eq(chatAttachments.id, id), eq(chatAttachments.chatId, chatId)))
  if (!file) throw new Error("Attachment not found")
  const key = await ensureChatContentKey(chatId)
  if (!key) throw new Error("Chat not found")
  const opened = openMessage(
    { id, role: "user", parts: file.sealed },
    chatId,
    key
  )
  const part = opened.parts[0] as { text: string }
  return {
    id: file.id,
    filename: file.filename,
    mediaType: file.mediaType,
    size: file.size,
    bytes: Buffer.from(part.text, "base64"),
  }
}

// Runs only after ownership checks, immediately before model generation. The
// stored transcript and Trigger streams keep references, never upload bytes.
export async function hydrateChatAttachments(
  userId: string,
  chatId: string,
  messages: ModelMessage[]
): Promise<ModelMessage[]> {
  const cache = new Map<
    string,
    Awaited<ReturnType<typeof readStoredAttachment>>
  >()
  const output: ModelMessage[] = []
  for (const message of messages) {
    if (message.role !== "user" || typeof message.content === "string") {
      output.push(message)
      continue
    }
    let total = 0
    let count = 0
    const content = []
    for (const part of message.content) {
      if (part.type !== "file") {
        content.push(part)
        continue
      }
      const data = part.data
      const url =
        data instanceof URL
          ? data.toString()
          : typeof data === "object" &&
              data !== null &&
              "type" in data &&
              data.type === "url" &&
              "url" in data
            ? String(data.url)
            : typeof data === "string" && /^https?:/.test(data)
              ? data
              : undefined
      if (!url) {
        content.push(part)
        continue
      }
      const id = attachmentId(url)
      if (!id) throw new Error("Use an uploaded chat attachment")
      let file = cache.get(id)
      if (!file) {
        file = await readStoredAttachment(userId, chatId, id)
        cache.set(id, file)
      }
      total += file.size
      if (++count > MAX_ATTACHMENTS || total > MAX_MESSAGE_ATTACHMENT_BYTES)
        throw new Error("Too many attachments in this message")
      if (
        file.mediaType.startsWith("text/") ||
        file.mediaType === "application/json"
      ) {
        // Bound text independently of upload size to protect the model context.
        const text = file.bytes.toString("utf8")
        content.push({
          type: "text" as const,
          text: `Attached context: ${file.filename}\n${text.slice(0, 60000)}${text.length > 60000 ? "\n[Remaining file content omitted: 60,000 character limit]" : ""}`,
        })
      } else
        content.push({
          type: "file" as const,
          filename: file.filename,
          mediaType: file.mediaType,
          data: { type: "data" as const, data: file.bytes.toString("base64") },
        })
    }
    output.push({ ...message, content })
  }
  return output
}

// Discarding a draft cannot remove a file already present in the transcript.
export async function discardChatAttachment(
  userId: string,
  chatId: string,
  id: string
) {
  await assertAttachmentChat(userId, chatId)
  await db.transaction(async (tx) => {
    await tx
      .select({ id: chats.id })
      .from(chats)
      .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
      .for("update")
    const [transcript] = await tx
      .select({ entries: chatTranscripts.entries })
      .from(chatTranscripts)
      .where(eq(chatTranscripts.chatId, chatId))
    if (JSON.stringify(transcript?.entries ?? []).includes(attachmentUrl(id)))
      throw new HttpError(
        409,
        "conflict",
        "This attachment is already part of a message"
      )
    await tx
      .delete(chatAttachments)
      .where(
        and(eq(chatAttachments.id, id), eq(chatAttachments.chatId, chatId))
      )
  })
}
