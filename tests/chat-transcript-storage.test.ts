import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import { memoryTranscriptStorage } from "@trigger.dev/sdk/ai"
import { runTranscriptStorageTests } from "@trigger.dev/sdk/ai/test"

import { startTestDatabase } from "./helpers/test-db"

// The chat agent's Neon transcript storage, against the SDK's own conformance
// suite, plus the reason it exists: history goes with the chat and account.

let database: Awaited<ReturnType<typeof startTestDatabase>>
let db: typeof import("../db").db
let schema: typeof import("../db/schema")
let storage: typeof import("../lib/chat-transcript-storage")
const legacyStorage = memoryTranscriptStorage()
let transcriptStorage: ReturnType<typeof storage.createChatTranscriptStorage>

const BASE = "conformance"
// The suite's chat IDs; each needs its chat row for the foreign key
const SUITE_CHATS = [
  "",
  "-put",
  "-remove",
  "-truncate",
  "-truncate-append",
  "-state",
  "-cursors",
  "-final",
  "-replay",
  "-paging",
  "-a",
  "-b",
].map((suffix) => `${BASE}${suffix}`)

const message = (id: string, text = id) => ({
  id,
  role: "user" as const,
  parts: [{ type: "text" as const, text }],
})

const context = (chatId: string) =>
  ({
    chatId,
    clientData: undefined,
    turn: 0,
    trigger: "submit-message",
    runId: "run_1",
    ctx: {},
  }) as never

const changeset = (ids: string[]) => ({
  reason: "turn-complete" as const,
  changes: ids.map((id) => ({ op: "put" as const, message: message(id) })),
  transcript: {
    entries: ids.map((id) => ({ id, final: true, message: message(id) })),
    state: null,
  },
})

before(async () => {
  database = await startTestDatabase()
  ;({ db } = await import("../db"))
  schema = await import("../db/schema")
  storage = await import("../lib/chat-transcript-storage")
  transcriptStorage = storage.createChatTranscriptStorage(legacyStorage)
  await db
    .insert(schema.chats)
    .values(SUITE_CHATS.map((id) => ({ id, userId: "user_suite" })))
})

after(async () => {
  await database?.stop()
})

describe("Neon transcript storage", () => {
  runTranscriptStorageTests(() => transcriptStorage, {
    chatId: BASE,
    api: {
      describe,
      it,
      expect: (actual: unknown) => ({
        toEqual: (expected: unknown) => assert.deepEqual(actual, expected),
        toBeNull: () => assert.equal(actual, null),
        toBeUndefined: () => assert.equal(actual, undefined),
        toBe: (expected: unknown) => assert.equal(actual, expected),
        toHaveLength: (length: number) =>
          assert.equal((actual as unknown[]).length, length),
      }),
    },
  })
})

it("history goes with its chat, and a late save can't bring it back", async () => {
  await db.insert(schema.chats).values([
    { id: "chat_gone", userId: "user_a" },
    { id: "chat_kept", userId: "user_a" },
  ])
  const chatTranscriptStorage = transcriptStorage
  await chatTranscriptStorage.save(context("chat_gone"), changeset(["m1"]))
  await chatTranscriptStorage.save(context("chat_kept"), changeset(["k1"]))

  const { eq } = await import("drizzle-orm")
  await db.delete(schema.chats).where(eq(schema.chats.id, "chat_gone"))
  assert.deepEqual(
    (
      await chatTranscriptStorage.load({
        chatId: "chat_gone",
        clientData: undefined,
      })
    ).messages,
    []
  )
  // A turn still running when the chat went
  await assert.rejects(
    chatTranscriptStorage.save(context("chat_gone"), changeset(["m1", "m2"]))
  )
  assert.deepEqual(
    (await db.select().from(schema.chatTranscripts))
      .map((row) => row.chatId)
      .sort(),
    [...SUITE_CHATS.filter((id) => id !== BASE), "chat_kept"].sort()
  )
})

it("account deletion removes the account's transcripts and no one else's", async () => {
  const account = await import("../services/account")
  const chatTranscriptStorage = transcriptStorage
  await db.insert(schema.bots).values([
    { id: "bot_b", userId: "user_b", name: "Quill", job: "Writer" },
    { id: "bot_c", userId: "user_c", name: "Scout", job: "Researcher" },
  ])
  await db.insert(schema.chats).values([
    { id: "chat_b", userId: "user_b", kind: "direct" },
    { id: "group_b", userId: "user_b", kind: "group", name: "Team" },
    { id: "chat_c", userId: "user_c", kind: "direct" },
  ])
  await db.insert(schema.chatMembers).values([
    { chatId: "chat_b", botId: "bot_b" },
    { chatId: "group_b", botId: "bot_b" },
    { chatId: "chat_c", botId: "bot_c" },
  ])
  for (const chatId of ["chat_b", "group_b", "chat_c"])
    await chatTranscriptStorage.save(
      context(chatId),
      changeset([`${chatId}_1`])
    )

  const { and, eq, inArray } = await import("drizzle-orm")
  await account.deleteAccount("user_b", {
    cancelSubscriptions: async () => {},
    closeChat: async () => {},
    deleteComputer: async () => {},
    // services/bots.deleteBot without its Sentry log
    deleteBot: async (userId, botId) => {
      await db
        .delete(schema.chats)
        .where(
          and(
            eq(schema.chats.userId, userId),
            eq(schema.chats.kind, "direct"),
            inArray(
              schema.chats.id,
              db
                .select({ id: schema.chatMembers.chatId })
                .from(schema.chatMembers)
                .where(eq(schema.chatMembers.botId, botId))
            )
          )
        )
      await db
        .delete(schema.bots)
        .where(and(eq(schema.bots.id, botId), eq(schema.bots.userId, userId)))
    },
    disconnectChatGPT: async () => {},
    disconnectApps: async () => {},
    deleteUser: async () => {},
  })
  const left = (await db.select().from(schema.chatTranscripts)).map(
    (row) => row.chatId
  )
  assert.ok(!left.includes("chat_b"))
  assert.ok(!left.includes("group_b"))
  assert.ok(left.includes("chat_c"))
})

it("pages like the SDK: most recent first, then before the cursor", () => {
  const entries = ["a", "b", "c", "d", "e"].map((id) => ({ id }))
  const last = storage.pageTranscript(entries, { limit: 2 })
  assert.deepEqual(
    last.entries.map((e) => e.id),
    ["d", "e"]
  )
  assert.equal(last.nextCursor, "d")
  const middle = storage.pageTranscript(entries, { limit: 2, before: "d" })
  assert.deepEqual(
    middle.entries.map((e) => e.id),
    ["b", "c"]
  )
  const first = storage.pageTranscript(entries, { limit: 2, before: "b" })
  assert.deepEqual(
    first.entries.map((e) => e.id),
    ["a"]
  )
  assert.equal(first.nextCursor, undefined)
  assert.deepEqual(
    storage.pageTranscript(entries, { before: "zz" }).entries,
    []
  )
  assert.equal(storage.pageTranscript(entries).entries.length, 5)
})

it("reads legacy history until Neon owns the chat, including empty history", async () => {
  await db.insert(schema.chats).values({ id: "chat_legacy", userId: "user_a" })
  await legacyStorage.save(
    context("chat_legacy"),
    changeset(["legacy_1", "legacy_2"])
  )
  const scope = { chatId: "chat_legacy", clientData: undefined }
  assert.deepEqual(
    (await transcriptStorage.load(scope)).messages.map((m) => m.id),
    ["legacy_1", "legacy_2"]
  )
  assert.deepEqual(
    (await transcriptStorage.load(scope, { limit: 1 })).messages.map(
      (m) => m.id
    ),
    ["legacy_2"]
  )

  await transcriptStorage.save(
    context(scope.chatId),
    changeset(["legacy_1", "legacy_2", "new_1"])
  )
  assert.deepEqual(
    (await transcriptStorage.load(scope)).messages.map((m) => m.id),
    ["legacy_1", "legacy_2", "new_1"]
  )
  // An undo to an empty transcript must not fall back to an old snapshot.
  await transcriptStorage.save(context(scope.chatId), changeset([]))
  assert.deepEqual((await transcriptStorage.load(scope)).messages, [])

  const { eq } = await import("drizzle-orm")
  await db.delete(schema.chats).where(eq(schema.chats.id, scope.chatId))
  assert.deepEqual((await transcriptStorage.load(scope)).messages, [])
  // The provider's retained copy still exists; local deletion is not erasure there.
  assert.equal((await legacyStorage.load(scope)).messages.length, 2)
})
