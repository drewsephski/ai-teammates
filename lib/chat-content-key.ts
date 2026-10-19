import { eq } from "drizzle-orm"

import { db } from "@/db"
import { chatContentKeys, chats } from "@/db/schema"
import {
  chatContentKeyBytes,
  isSealedMessage,
  newChatContentKey,
  openMessage,
} from "@/lib/chat-content-seal"

async function storedKey(chatId: string) {
  const row = await db.query.chatContentKeys.findFirst({
    columns: { key: true },
    where: eq(chatContentKeys.chatId, chatId),
  })
  return row && chatContentKeyBytes(row.key)
}

// The chat's sealing key (lib/chat-content-seal.ts), made on first use.
// Undefined when the chat doesn't exist, so nothing is sealed for, or sent to,
// a deleted chat. Concurrent first sends agree on one key.
export async function ensureChatContentKey(chatId: string) {
  const existing = await storedKey(chatId)
  if (existing) return existing
  const chat = await db.query.chats.findFirst({
    columns: { id: true },
    where: eq(chats.id, chatId),
  })
  if (!chat) return
  await db
    .insert(chatContentKeys)
    .values({ chatId, key: newChatContentKey() })
    .onConflictDoNothing()
  return storedKey(chatId)
}

// Opens the sealed messages a turn received. A chat whose key is gone fails
// the turn instead of answering ciphertext. Unsealed messages, from app builds
// that still append to Trigger.dev directly, pass through.
export async function openChatMessages<
  T extends { id?: string; role?: string; parts?: unknown[] },
>(chatId: string, messages: T[]) {
  if (!messages.some(isSealedMessage)) return messages
  const key = await storedKey(chatId)
  if (!key) throw new Error("This chat no longer exists")
  return messages.map((message) => openMessage(message, chatId, key))
}
