import assert from "node:assert/strict"
import { after, before, test } from "node:test"

import { startTestDatabase } from "./helpers/test-db"

let database: Awaited<ReturnType<typeof startTestDatabase>>
let wake: typeof import("../lib/connect-wake")

type Post = [string, Record<string, unknown>, Record<string, unknown>]

before(async () => {
  database = await startTestDatabase()
  const { db } = await import("../db")
  const schema = await import("../db/schema")
  wake = await import("../lib/connect-wake")
  await db.insert(schema.bots).values([
    { id: "bot_a1", userId: "A", name: "Quill", job: "Writer" },
    { id: "bot_a2", userId: "A", name: "Ledger", job: "Analyst" },
  ])
  await db
    .insert(schema.chats)
    .values([{ id: "chat_a", userId: "A", kind: "group", name: "Team" }])
  await db
    .insert(schema.chatMembers)
    .values([{ chatId: "chat_a", botId: "bot_a1" }])
})

after(async () => {
  await database?.stop()
})

function fakes(fail = false) {
  const posts: Post[] = []
  return {
    posts,
    deps: {
      toolkitName: async () => "Gmail",
      postChatMessage: (async (
        chatId: string,
        message: never,
        options: never
      ) => {
        if (fail) throw new Error("down")
        posts.push([chatId, message, options])
      }) as never,
    },
  }
}

const attempt = {
  state: "1f3c9a0e-0000-4000-8000-000000000001",
  chatId: "chat_a",
  questionId: "call_1",
  botId: "bot_a1",
  toolkit: "gmail",
}

test("the owner's connect card wakes its bot with connect_<state> and the question id", async () => {
  const { posts, deps } = fakes()
  assert.equal((await wake.wakeAfterConnect("A", attempt, deps)).woke, true)
  assert.deepEqual(posts, [
    [
      "chat_a",
      {
        id: `connect_${attempt.state}`,
        text: wake.connectWakePrompt("Gmail"),
        displayPrompt: "Connected Gmail",
        questionId: "call_1",
      },
      { botId: "bot_a1" },
    ],
  ])
  // A repeat completion posts the same id, which the append deduplicates
  await wake.wakeAfterConnect("A", attempt, deps)
  assert.equal(posts[1][1].id, posts[0][1].id)
})

test("another account's chat is never woken", async () => {
  const { posts, deps } = fakes()
  assert.equal((await wake.wakeAfterConnect("B", attempt, deps)).woke, false)
  assert.equal(posts.length, 0)
})

test("a bot that isn't in the chat is never woken", async () => {
  const { posts, deps } = fakes()
  assert.equal(
    (await wake.wakeAfterConnect("A", { ...attempt, botId: "bot_a2" }, deps))
      .woke,
    false
  )
  assert.equal(posts.length, 0)
})

test("a failed post gives woke: false", async () => {
  const { deps } = fakes(true)
  assert.equal((await wake.wakeAfterConnect("A", attempt, deps)).woke, false)
})

test("the prompt tells the bot to discover tools and not ask again", () => {
  const prompt = wake.connectWakePrompt("Gmail")
  assert.match(prompt, /Gmail/)
  assert.match(prompt, /searchAppTools/)
  assert.match(prompt, /Don't ask/)
  assert.equal(wake.connectWakeMessageId("s"), "connect_s")
})
