import { locals } from "@trigger.dev/sdk"
import {
  defaultStorage,
  type TranscriptLoadOptions,
  type TranscriptState,
  type TranscriptScope,
  type TranscriptStorage,
} from "@trigger.dev/sdk/ai"
import type { UIMessage } from "ai"
import { eq, sql } from "drizzle-orm"

import { db } from "@/db"
import { chats, chatTranscripts } from "@/db/schema"

// The chat agent's transcript storage, in Neon instead of Trigger.dev.
//
// Without a `storage`, chat.agent keeps each conversation as a snapshot in
// Trigger.dev's object store, which no supported API deletes (4.7.4). With
// this one, the SDK never writes that snapshot (it is only written by the
// built-in snapshot storage), and the history is a row that cascades with its
// chat, so deleting a chat, a bot or the account deletes it.
//
// One document per chat: `save` gets the whole transcript after each change
// and writes it as is, which the SDK documents for document stores. Errors
// propagate; the runtime logs them and the turn continues.
// https://trigger.dev/docs/ai-chat/transcript-storage

type Entry = TranscriptState["entries"][number]

// Trigger locals reset between runs. A failed boot read makes SDK 4.7.4
// continue from only its stream tail. Never let that incomplete run replace
// the complete document, even if the database or a later read recovers.
const failedLoads = locals.create<Set<string>>("krafty-transcript-failed-loads")

// The SDK's paging (pageTranscriptEntries in @trigger.dev/core): `before`
// keeps what precedes that id, `limit` keeps the most recent ones, and
// `nextCursor` is the id to pass as `before` for the page before
export function pageTranscript<T extends { id: string }>(
  all: readonly T[],
  opts?: TranscriptLoadOptions
) {
  let entries = all
  if (opts?.before !== undefined) {
    const index = entries.findIndex((entry) => entry.id === opts.before)
    if (index === -1) return { entries: [] as T[], nextCursor: undefined }
    entries = entries.slice(0, index)
  }
  let nextCursor: string | undefined
  if (
    opts?.limit !== undefined &&
    opts.limit > 0 &&
    entries.length > opts.limit
  ) {
    entries = entries.slice(entries.length - opts.limit)
    nextCursor = entries[0]?.id
  }
  return { entries: [...entries], nextCursor }
}

export function createChatTranscriptStorage(
  legacyStorage: Pick<TranscriptStorage, "load"> = defaultStorage
): TranscriptStorage {
  return {
    async load<TUIMessage extends UIMessage = UIMessage>(
      scope: TranscriptScope,
      opts?: TranscriptLoadOptions
    ) {
      try {
        const [row] = await db
          .select()
          .from(chatTranscripts)
          .where(eq(chatTranscripts.chatId, scope.chatId))
        if (!row) {
          // Existing conversations have only a Trigger snapshot until their first
          // save on this deployment. Read it, but never write new snapshots. Check
          // the chat still exists so a deleted chat cannot resurrect old content.
          const [liveChat] = await db
            .select({ id: chats.id })
            .from(chats)
            .where(eq(chats.id, scope.chatId))
          if (!liveChat) return { messages: [], state: null }
          return await legacyStorage.load<TUIMessage>(scope, opts)
        }
        const page = pageTranscript(row.entries as Entry[], opts)
        return {
          // The runtime supplies the concrete UIMessage type on read.
          messages: page.entries.map((entry) => entry.message) as TUIMessage[],
          nextCursor: page.nextCursor,
          nonFinalIds: page.entries
            .filter((entry) => !entry.final)
            .map((entry) => entry.id),
          state: row.state ?? null,
          cursors: row.cursors ?? undefined,
        }
      } catch (error) {
        const failed = locals.get(failedLoads) ?? new Set<string>()
        failed.add(scope.chatId)
        locals.set(failedLoads, failed)
        throw error
      }
    },

    // A chat deleted mid-turn fails the foreign key, so a late save can't bring
    // its history back
    async save(ctx, changeset) {
      if (locals.get(failedLoads)?.has(ctx.chatId)) {
        throw new Error(
          "Transcript save blocked after a failed load; start a new run"
        )
      }
      const values = {
        chatId: ctx.chatId,
        entries: changeset.transcript.entries,
        state: changeset.transcript.state ?? null,
        cursors: changeset.cursors ?? null,
      }
      await db
        .insert(chatTranscripts)
        .values(values)
        .onConflictDoUpdate({
          target: chatTranscripts.chatId,
          set: {
            entries: values.entries,
            state: values.state,
            // A save without cursors keeps the last ones
            cursors: sql`coalesce(excluded.cursors, ${chatTranscripts.cursors})`,
            updatedAt: sql`now()`,
          },
        })
    },
  }
}

export const chatTranscriptStorage = createChatTranscriptStorage()
