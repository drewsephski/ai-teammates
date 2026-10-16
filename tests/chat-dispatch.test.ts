import assert from "node:assert/strict"
import test, { mock } from "node:test"

import { sessions } from "@trigger.dev/sdk"

import { postChatMessage } from "../lib/chat-dispatch"

async function post(message: Parameters<typeof postChatMessage>[1]) {
  mock.method(sessions, "start", async () => ({}))
  process.env.TRIGGER_SECRET_KEY = "tr_test"
  const bodies: { payload: { message: { metadata?: unknown } } }[] = []
  const headers: Record<string, string>[] = []
  await postChatMessage("chat_1", message, {
    botId: "bot_1",
    fetchImpl: (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string))
      headers.push(init.headers as Record<string, string>)
      return new Response("{}", { status: 200 })
    }) as unknown as typeof fetch,
  })
  mock.restoreAll()
  return { body: bodies[0], headers: headers[0] }
}

test("displayPrompt and questionId travel together in the message metadata", async () => {
  const { body, headers } = await post({
    id: "connect_s1",
    text: "Connected",
    displayPrompt: "Connected Gmail",
    questionId: "call_9",
  })
  assert.deepEqual(body.payload.message.metadata, {
    displayPrompt: "Connected Gmail",
    questionId: "call_9",
  })
  assert.equal(headers["X-Part-Id"], "connect_s1")
})

test("only the metadata keys that are set are sent", async () => {
  assert.deepEqual(
    (await post({ id: "a", text: "x", questionId: "q" })).body.payload.message
      .metadata,
    { questionId: "q" }
  )
  assert.equal(
    (await post({ id: "b", text: "x" })).body.payload.message.metadata,
    undefined
  )
})
