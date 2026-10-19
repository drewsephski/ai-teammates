import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

// Seals what a person writes before it reaches a Trigger.dev session's input
// stream. Trigger.dev keeps those records, and the trace attribute the SDK
// copies from them, with no supported delete, so the text goes there only as
// AES-256-GCM ciphertext under a per-chat key held in our database
// (chat_content_keys). Deleting the chat deletes the key, and with it every
// readable copy at Trigger.dev. The agent opens messages in onValidateMessages,
// before anything else reads them (trigger/chat.ts).
//
// Only user messages are sealed: clients send nothing else. Each one keeps its
// id and role in the clear, because the runtime merges by id, and carries its
// parts and metadata (displayPrompt, questionId) as one sealed data part.

export const SEALED_PART_TYPE = "data-sealed"

type Message = {
  id?: string
  role?: string
  parts?: unknown[]
  metadata?: unknown
}

type SealedData = { v: 1; iv: string; tag: string; data: string }

export function newChatContentKey() {
  return randomBytes(32).toString("base64url")
}

export function chatContentKeyBytes(value: string) {
  const key = Buffer.from(value, "base64url")
  if (key.length !== 32) throw new Error("Invalid chat content key")
  return key
}

// Binds the ciphertext to its chat and message, so it can't be replayed into
// another conversation or swapped for another message
function context(chatId: string, messageId: string | undefined) {
  return Buffer.from(`krafty:chat-content:v1:${chatId}:${messageId ?? ""}`)
}

function sealedData(message: Message): SealedData | undefined {
  const [part, extra] = message.parts ?? []
  if (extra !== undefined || !part || typeof part !== "object") return
  const { type, data } = part as { type?: unknown; data?: unknown }
  if (type !== SEALED_PART_TYPE || !data || typeof data !== "object") return
  return data as SealedData
}

export function isSealedMessage(message: Message) {
  return sealedData(message) !== undefined
}

export function sealMessage<T extends Message>(
  message: T,
  chatId: string,
  key: Buffer
): T {
  if (message.role !== "user" || isSealedMessage(message)) return message
  const { parts, metadata, ...rest } = message
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  cipher.setAAD(context(chatId, message.id))
  const data = Buffer.concat([
    cipher.update(JSON.stringify({ parts: parts ?? [], metadata }), "utf8"),
    cipher.final(),
  ])
  const sealed: SealedData = {
    v: 1,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    data: data.toString("base64url"),
  }
  return { ...rest, parts: [{ type: SEALED_PART_TYPE, data: sealed }] } as T
}

export function openMessage<T extends Message>(
  message: T,
  chatId: string,
  key: Buffer
): T {
  const sealed = sealedData(message)
  if (!sealed) return message
  if (sealed.v !== 1) throw new Error("Unsupported sealed message")
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(sealed.iv, "base64url")
  )
  decipher.setAAD(context(chatId, message.id))
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64url"))
  const { parts, metadata } = JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(sealed.data, "base64url")),
      decipher.final(),
    ]).toString("utf8")
  ) as { parts: unknown[]; metadata?: unknown }
  // The sealed part is replaced, so the opened message has the sent key order
  return {
    ...message,
    parts,
    ...(metadata !== undefined && { metadata }),
  } as T
}

// Seals the message in one serialized `.in` record, the body the chat
// transport (and postChatMessage) appends. Records without a user message,
// such as `stop`, come back unchanged. Returns undefined for a body that isn't
// a JSON object, which the caller refuses rather than forward in the clear.
export function sealInputRecord(body: string, chatId: string, key: Buffer) {
  let record: unknown
  try {
    record = JSON.parse(body)
  } catch {
    return
  }
  if (!record || typeof record !== "object" || Array.isArray(record)) return
  const { kind, payload } = record as { kind?: unknown; payload?: unknown }
  if (kind !== "message" || !payload || typeof payload !== "object") return body
  const message = (payload as { message?: unknown }).message
  if (!message || typeof message !== "object") return body
  return JSON.stringify({
    ...record,
    payload: {
      ...payload,
      message: sealMessage(message as Message, chatId, key),
    },
  })
}
