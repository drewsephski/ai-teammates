import * as Sentry from "@sentry/nextjs"

import { eraseChatSession } from "@/lib/trigger-session-erasure"

// Erases what Trigger.dev holds for a chat that is about to be deleted
// (lib/trigger-session-erasure.ts). Best effort, so a Trigger.dev outage
// doesn't stop someone deleting a bot or chat: the chat's sealing key goes
// with its row either way, and the daily sweep
// (trigger/erase-orphan-sessions.ts) retries the session once the row is gone.
export async function eraseDeletedChat(chatId: string) {
  try {
    await eraseChatSession(chatId, "chat_deleted")
  } catch (cause) {
    Sentry.captureException(cause, { extra: { chatId } })
  }
}
