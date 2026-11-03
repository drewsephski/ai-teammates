import { locals } from "@trigger.dev/sdk"
import { chat } from "@trigger.dev/sdk/ai"
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm"
import { nanoid } from "nanoid"
import type { ModelMessage, UIMessage } from "ai"
import { db } from "@/db"
import { chatAttachments, chats, chatTranscripts } from "@/db/schema"
import { HttpError } from "@/lib/api-response"
import { ensureChatContentKey, openChatMessages } from "@/lib/chat-content-key"
import { assertWorkerChatSession } from "@/lib/chat-session-context"
import { openMessage, sealMessage } from "@/lib/chat-content-seal"
import {
  attachmentId,
  chatAttachmentReferences,
  attachmentNameSchema,
  attachmentTypeSchema,
  attachmentUrl,
  MAX_ATTACHMENTS,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_MESSAGE_ATTACHMENT_BYTES,
  validAttachmentBytes,
} from "@/lib/chat-attachment-policy"

const currentAttachmentIds = locals.create<string[]>(
  "krafty-current-attachment-ids"
)
const rejectedAttachmentInput = locals.create<UIMessage[]>(
  "krafty-rejected-attachment-input"
)

// Tools are resolved before validation, including turns with no incoming delta
// (regenerate). Never reuse a preceding turn's list of required references.
export function resetChatAttachmentInput() {
  locals.set(currentAttachmentIds, [])
  locals.set(rejectedAttachmentInput, undefined)
}

export function currentChatAttachmentIds() {
  return locals.get(currentAttachmentIds) ?? []
}

export async function validateWorkerChatMessages<T extends UIMessage>(
  chatId: string,
  messages: T[]
) {
  assertWorkerChatSession(chatId)
  try {
    const opened = await openChatMessages(chatId, messages)
    const refs = chatAttachmentReferences(opened)
    if (refs.some((ids) => ids.length)) {
      const [owned] = await db
        .select({ userId: chats.userId })
        .from(chats)
        .where(eq(chats.id, chatId))
      if (!owned) throw new Error("Chat not found")
      locals.set(
        currentAttachmentIds,
        await validateChatAttachmentMessages(owned.userId, chatId, opened)
      )
    }
    return opened
  } catch (error) {
    locals.set(rejectedAttachmentInput, chat.history.all())
    chat.endRun()
    throw error
  }
}

// SDK 4.7.4 folds rejected wire input into its error-path snapshot. Override
// that snapshot before saving, so a rejected foreign/external reference cannot
// poison subsequent turns. The SDK still delivers this turn's error to the UI.
export async function recoverRejectedChatAttachmentInput() {
  const rejected = locals.get(rejectedAttachmentInput)
  if (!rejected) return false
  await chat.setMessages(rejected)
  return true
}

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
    const [owned] = await tx
      .select({ id: chats.id })
      .from(chats)
      .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
      .for("update")
    if (!owned) throw new Error("Chat not found")
    // Reclaim abandoned draft uploads, including uploads whose response was
    // lost. Validated files are pinned before transcript persistence.
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
          isNull(chatAttachments.referencedAt),
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

// Only absence can recover in historical context; integrity/DB/access errors
// retain their normal failure behavior and must never become placeholders.
class MissingChatAttachmentError extends Error {
  constructor() {
    super("Attachment not found")
  }
}

// Called after the worker binds the session and opens the incoming delta.
// Lock order is always chat first, then attachment rows, as in draft cleanup.
export async function validateChatAttachmentMessages(
  userId: string,
  chatId: string,
  messages: readonly UIMessage[]
) {
  const groups = chatAttachmentReferences(messages)
  const ids = [...new Set(groups.flat())]
  if (!ids.length) return ids
  await db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: chats.id })
      .from(chats)
      .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
      .for("update")
    if (!owned) throw new Error("Chat not found")
    const files = await tx
      .select({ id: chatAttachments.id, size: chatAttachments.size })
      .from(chatAttachments)
      .where(
        and(
          eq(chatAttachments.chatId, chatId),
          inArray(chatAttachments.id, ids)
        )
      )
    const sizes = new Map(files.map((file) => [file.id, file.size]))
    if (ids.some((id) => !sizes.has(id)))
      throw new Error("Attachment not found")
    if (
      groups.some(
        (group) =>
          group.reduce((total, id) => total + sizes.get(id)!, 0) >
          MAX_MESSAGE_ATTACHMENT_BYTES
      )
    )
      throw new Error("Too many attachments in this message")
    await tx
      .update(chatAttachments)
      .set({ referencedAt: new Date() })
      .where(
        and(
          eq(chatAttachments.chatId, chatId),
          inArray(chatAttachments.id, ids),
          isNull(chatAttachments.referencedAt)
        )
      )
  })
  return ids
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
  if (!file) {
    // A reference to another chat is not a missing historical upload.
    const [foreign] = await db
      .select({ id: chatAttachments.id })
      .from(chatAttachments)
      .where(eq(chatAttachments.id, id))
    if (foreign) throw new Error("Attachment not found")
    throw new MissingChatAttachmentError()
  }
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
  messages: ModelMessage[],
  history?: { requiredIds: readonly string[] }
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
      if (++count > MAX_ATTACHMENTS)
        throw new Error("Too many attachments in this message")
      let file = cache.get(id)
      if (!file) {
        try {
          file = await readStoredAttachment(userId, chatId, id)
        } catch (error) {
          if (
            history &&
            !history.requiredIds.includes(id) &&
            error instanceof MissingChatAttachmentError
          ) {
            content.push({
              type: "text" as const,
              text: "[Earlier attachment unavailable; ask the person to attach it again]",
            })
            continue
          }
          throw error
        }
        cache.set(id, file)
      }
      total += file.size
      if (total > MAX_MESSAGE_ATTACHMENT_BYTES)
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
    const [owned] = await tx
      .select({ id: chats.id })
      .from(chats)
      .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
      .for("update")
    if (!owned) throw new Error("Chat not found")
    const [transcript] = await tx
      .select({ entries: chatTranscripts.entries })
      .from(chatTranscripts)
      .where(eq(chatTranscripts.chatId, chatId))
    const [file] = await tx
      .select({ referencedAt: chatAttachments.referencedAt })
      .from(chatAttachments)
      .where(
        and(eq(chatAttachments.id, id), eq(chatAttachments.chatId, chatId))
      )
    if (
      file?.referencedAt ||
      JSON.stringify(transcript?.entries ?? []).includes(attachmentUrl(id))
    )
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
