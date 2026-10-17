import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import {
  aiContentReports,
  aiContentReportSchema,
  chats,
  type AIContentReportInput,
} from "@/db/schema"
import { loadTranscript } from "@/services/chats"

type Transcript = {
  messages: {
    id: string
    role: string
    parts: { type: string; text?: string }[]
  }[]
}
type Dependencies = {
  loadTranscript: (userId: string, chatId: string) => Promise<Transcript>
}
const identifier = z.string().min(1).max(200)

// The caller supplies identity. Client text is never accepted as evidence of
// what the agent said; load the message from the owned server transcript.
export async function reportAIContent(
  userId: string,
  chatId: string,
  messageId: string,
  input: AIContentReportInput,
  dependencies: Dependencies = { loadTranscript }
) {
  identifier.parse(chatId)
  identifier.parse(messageId)
  const values = aiContentReportSchema.parse(input)
  const [owned] = await db
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
    .limit(1)
  if (!owned) throw new Error("Chat not found")

  // A retry succeeds even if the provider is unavailable after the first save.
  const [existing] = await db
    .select({ id: aiContentReports.id })
    .from(aiContentReports)
    .where(
      and(
        eq(aiContentReports.userId, userId),
        eq(aiContentReports.chatId, chatId),
        eq(aiContentReports.messageId, messageId)
      )
    )
    .limit(1)
  if (existing) return { reported: true as const, created: false }

  const transcript = await dependencies.loadTranscript(userId, chatId)
  const message = transcript.messages.find(
    (item) => item.id === messageId && item.role === "assistant"
  )
  if (!message) throw new Error("Message not found")
  const messageText = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n")
  const inserted = await db
    .insert(aiContentReports)
    .values({
      ...values,
      userId,
      chatId,
      messageId,
      messageText,
    })
    .onConflictDoNothing({
      target: [
        aiContentReports.userId,
        aiContentReports.chatId,
        aiContentReports.messageId,
      ],
    })
    .returning({ id: aiContentReports.id })
  return { reported: true as const, created: inserted.length > 0 }
}
