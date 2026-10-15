import assert from "node:assert/strict"
import { after, before, test } from "node:test"

import { startTestDatabase } from "./helpers/test-db"

// The parity endpoints (/api/v1/chats/:id/origin, /api/v1/bots/activity) are
// owner-checked before any Trigger.dev call, against the real schema.

const A = "user_a"
const B = "user_b"

let database: Awaited<ReturnType<typeof startTestDatabase>>
let chats: typeof import("../services/chats")
let workspace: typeof import("../services/workspace")

before(async () => {
  database = await startTestDatabase()
  const { db } = await import("../db")
  const schema = await import("../db/schema")
  chats = await import("../services/chats")
  workspace = await import("../services/workspace")
  await db
    .insert(schema.bots)
    .values([{ id: "bot_a1", userId: A, name: "Quill", job: "Writer" }])
  await db
    .insert(schema.chats)
    .values([{ id: "chat_a1", userId: A, kind: "direct" }])
  await db
    .insert(schema.chatMembers)
    .values([{ chatId: "chat_a1", botId: "bot_a1" }])
})

after(async () => {
  await database.stop()
})

test("another account can't read where a chat was delegated from", async () => {
  await assert.rejects(chats.getChatOrigin(B, "chat_a1"), /Chat not found/)
  await assert.rejects(chats.getChatOrigin(B, "chat_missing"), /Chat not found/)
})

test("an account without bots has no workspace activity to fetch", async () => {
  assert.deepEqual(await workspace.listWorkspaceBots(B), [])
})
