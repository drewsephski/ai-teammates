import * as Sentry from "@sentry/node"
import { and, eq } from "drizzle-orm"

import { db } from "@/db"
import { chatMembers, chats } from "@/db/schema"
import { postChatMessage } from "@/lib/chat-dispatch"

// Message IDs mark a turn's origin, and the ID is the append's idempotency key,
// so completing the same attempt twice wakes the bot once. `connect_` turns
// are attended: the person just acted.
export function connectWakeMessageId(state: string) {
  return `connect_${state}`
}

export function connectWakePrompt(name: string) {
  return `The person connected ${name} from the connection card in this chat. Use searchAppTools to discover ${name}'s tools, then continue the task they asked for. Don't ask them to connect it again or to confirm. If you already continued the task after they said they connected it, don't repeat that work: check what's done and only finish what's left.`
}

export type ConnectAttempt = {
  chatId: string
  questionId?: string | null
  botId?: string | null
  toolkit: string
}

export type ConnectWakeDeps = {
  postChatMessage: typeof postChatMessage
  toolkitName: (slug: string) => Promise<string>
}

async function defaultToolkitName(slug: string) {
  // Loaded on use: the catalog pulls in the Composio client
  return (await import("@/lib/app-catalog")).toolkitName(slug)
}

// Wakes the bot that showed the connect card, once the connection is verified.
// The attempt came from the person's own request, but its chat and bot are
// checked again here. Returns whether the bot was reached, and the posted
// message's input seq for the watching browser.
export async function wakeAfterConnect(
  userId: string,
  attempt: ConnectAttempt & { state: string },
  deps: Partial<ConnectWakeDeps> = {}
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
    const name = await (deps.toolkitName ?? defaultToolkitName)(attempt.toolkit)
    const posted = await (deps.postChatMessage ?? postChatMessage)(
      attempt.chatId,
      {
        id: connectWakeMessageId(attempt.state),
        text: connectWakePrompt(name),
        displayPrompt: `Connected ${name}`,
        ...(attempt.questionId && { questionId: attempt.questionId }),
      },
      { ...(botId && { botId }) }
    )
    return { woke: true, inputSeq: posted ? posted.inputSeq : undefined }
  } catch (error) {
    Sentry.captureException(error)
    return missed
  }
}
