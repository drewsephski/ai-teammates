import * as Sentry from "@sentry/node"
import { and, eq } from "drizzle-orm"

import { db } from "@/db"
import { chatMembers, chats } from "@/db/schema"
import { postChatMessage } from "@/lib/chat-dispatch"

// Like `connect_` (lib/connect-wake.ts), the ID marks the turn's origin and is
// the append's idempotency key, so saving from the same card twice wakes the
// bot once. `secret_` turns are attended: the person just acted.
export function secretWakeMessageId(questionId: string) {
  return `secret_${questionId}`
}

// Names the key, never its value: the model only ever sees `$NAME`
export function secretWakePrompt(name: string, label: string) {
  return `The person saved ${label} from the key card in this chat. It is set as $${name} in every bash command on your computer. Continue the task they asked for without asking for the key again. Never print, echo, log or write its value.`
}

export type SecretAttempt = {
  chatId: string
  botId?: string | null
  questionId: string
  name: string
  label: string
}

export type SecretWakeDeps = {
  postChatMessage: typeof postChatMessage
}

// Wakes the bot that showed the key card, once the key is saved. The chat and
// bot come from the client, so both are checked against the owner here.
// Returns whether the bot was reached, and the posted message's input seq for
// the watching browser.
export async function wakeAfterSecret(
  userId: string,
  attempt: SecretAttempt,
  deps: Partial<SecretWakeDeps> = {}
): Promise<{ woke: boolean; inputSeq?: number }> {
  const missed = { woke: false }
  try {
    const [chat] = await db
      .select({ id: chats.id })
      .from(chats)
      .where(and(eq(chats.id, attempt.chatId), eq(chats.userId, userId)))
    if (!chat) return missed
    let botId: string | undefined
    if (attempt.botId) {
      const [member] = await db
        .select({ botId: chatMembers.botId })
        .from(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, attempt.chatId),
            eq(chatMembers.botId, attempt.botId)
          )
        )
      if (!member) return missed
      botId = member.botId
    }
    const posted = await (deps.postChatMessage ?? postChatMessage)(
      attempt.chatId,
      {
        id: secretWakeMessageId(attempt.questionId),
        text: secretWakePrompt(attempt.name, attempt.label),
        displayPrompt: `Saved ${attempt.label}`,
        questionId: attempt.questionId,
      },
      { ...(botId && { botId }) }
    )
    return { woke: true, inputSeq: posted ? posted.inputSeq : undefined }
  } catch (error) {
    Sentry.captureException(error)
    return missed
  }
}
