import assert from "node:assert/strict"
import { after, before, test } from "node:test"

import { startTestDatabase } from "./helpers/test-db"

// Each chat's sealing key lives only in chat_content_keys and goes with the
// chat, which is what makes Trigger.dev's copies of its messages unreadable.

let database: Awaited<ReturnType<typeof startTestDatabase>>
let db: typeof import("../db").db
let schema: typeof import("../db/schema")
let keys: typeof import("../lib/chat-content-key")
let seal: typeof import("../lib/chat-content-seal")

before(async () => {
  database = await startTestDatabase()
  ;({ db } = await import("../db"))
  schema = await import("../db/schema")
  keys = await import("../lib/chat-content-key")
  seal = await import("../lib/chat-content-seal")
  await db.insert(schema.chats).values([
    { id: "chat_key_a", userId: "user_key" },
    { id: "chat_key_b", userId: "user_key" },
  ])
})

after(async () => {
  await database?.stop()
})

test("a chat gets one key, made on first use, and other chats their own", async () => {
  const [first, second] = await Promise.all([
    keys.ensureChatContentKey("chat_key_a"),
    keys.ensureChatContentKey("chat_key_a"),
  ])
  assert.ok(first)
  assert.deepEqual(first, second)
  assert.deepEqual(await keys.ensureChatContentKey("chat_key_a"), first)
  assert.notDeepEqual(await keys.ensureChatContentKey("chat_key_b"), first)
})

test("no key is made for a chat that doesn't exist", async () => {
  assert.equal(await keys.ensureChatContentKey("chat_missing"), undefined)
})

test("the agent opens sealed messages and passes unsealed ones through", async () => {
  const key = (await keys.ensureChatContentKey("chat_key_a"))!
  const message = {
    id: "m1",
    role: "user",
    parts: [{ type: "text", text: "hello" }],
  }
  const legacy = {
    id: "m0",
    role: "user",
    parts: [{ type: "text", text: "old" }],
  }
  const opened = await keys.openChatMessages("chat_key_a", [
    legacy,
    seal.sealMessage(message, "chat_key_a", key),
  ])
  assert.deepEqual(opened, [legacy, message])
  // Nothing sealed: no database read needed, same array back
  const plain = [legacy]
  assert.equal(await keys.openChatMessages("chat_gone", plain), plain)
})

test("deleting the chat deletes its key, so its sealed messages can't be opened", async () => {
  const { eq } = await import("drizzle-orm")
  const key = (await keys.ensureChatContentKey("chat_key_b"))!
  const sealed = seal.sealMessage(
    { id: "m1", role: "user", parts: [{ type: "text", text: "secret" }] },
    "chat_key_b",
    key
  )
  await db.delete(schema.chats).where(eq(schema.chats.id, "chat_key_b"))
  assert.equal(
    (
      await db
        .select()
        .from(schema.chatContentKeys)
        .where(eq(schema.chatContentKeys.chatId, "chat_key_b"))
    ).length,
    0
  )
  await assert.rejects(
    keys.openChatMessages("chat_key_b", [sealed]),
    /This chat no longer exists/
  )
})
