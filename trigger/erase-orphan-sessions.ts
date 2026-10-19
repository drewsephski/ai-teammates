import * as Sentry from "@sentry/node"
import { schedules, sessions } from "@trigger.dev/sdk"
import { inArray } from "drizzle-orm"

import { db } from "@/db"
import { chats } from "@/db/schema"
import {
  ERASED_TAG,
  eraseChatSession,
  sweepOrphanSessions,
} from "@/lib/trigger-session-erasure"

// Erases Trigger.dev sessions whose chat is gone: chats deleted before erasure
// shipped, and erasures that failed when a bot or chat was deleted
// (services/chat-erasure.ts). Each erasure can run again, so a retry or an
// overlapping run is harmless. In development it sweeps the development
// environment's sessions, against the shared database.
export const eraseOrphanSessions = schedules.task({
  id: "erase-orphan-sessions",
  cron: "23 4 * * *",
  queue: { concurrencyLimit: 1 },
  maxDuration: 1800,
  run: async () => {
    const result = await sweepOrphanSessions({
      list: async function* () {
        for await (const session of sessions.list({
          type: "chat.agent",
          limit: 100,
        })) {
          const ended =
            session.closedAt !== null ||
            (session.expiresAt !== null &&
              session.expiresAt.getTime() <= Date.now())
          yield {
            externalId: session.externalId,
            createdAt: session.createdAt,
            // An erasure that stopped before closing is finished next time
            erased: session.tags.includes(ERASED_TAG) && ended,
          }
        }
      },
      existingChats: async (chatIds) =>
        new Set(
          (
            await db
              .select({ id: chats.id })
              .from(chats)
              .where(inArray(chats.id, chatIds))
          ).map((chat) => chat.id)
        ),
      erase: (chatId) =>
        eraseChatSession(chatId, "chat_deleted").catch((cause: unknown) => {
          Sentry.captureException(cause, { extra: { chatId } })
          throw cause
        }),
    })
    if (result.erased || result.failed)
      Sentry.logger.info("Orphan sessions erased", result)
    return result
  },
})
