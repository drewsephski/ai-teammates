import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { chat, memoryTranscriptStorage } from "@trigger.dev/sdk/ai"
import { mockChatAgent } from "@trigger.dev/sdk/ai/test"
import { simulateReadableStream, type UIMessage } from "ai"
import { MockLanguageModelV4 } from "ai/test"

import { startTestDatabase } from "./helpers/test-db"

// The runtime contract trigger/chat.ts relies on: onValidateMessages sees a
// turn's message before anything else, so with the same hook the model and the
// transcript get the opened text, while Trigger.dev's input stream holds only
// ciphertext.

let database: Awaited<ReturnType<typeof startTestDatabase>>
let keys: typeof import("../lib/chat-content-key")
let seal: typeof import("../lib/chat-content-seal")

before(async () => {
  database = await startTestDatabase()
  const { db } = await import("../db")
  const schema = await import("../db/schema")
  keys = await import("../lib/chat-content-key")
  seal = await import("../lib/chat-content-seal")
  await db.insert(schema.chats).values({ id: "chat_sealed", userId: "user_s" })
})

after(async () => {
  await database?.stop()
})

function model() {
  return new MockLanguageModelV4({
    doStream: {
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: "Noted." },
          { type: "text-end", id: "t" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: { total: 1, text: 1, reasoning: 0 },
            },
          },
        ],
      }),
    },
  })
}

test("a sealed message is opened before the model and the transcript see it", async () => {
  const mock = model()
  const storage = memoryTranscriptStorage()
  const agent = chat.agent({
    id: "sealed-chat-test",
    storage,
    onValidateMessages: ({ chatId, messages }) =>
      keys.openChatMessages(chatId, messages),
    run: async ({ messages, signal, streamText }) =>
      streamText({ model: mock, messages, abortSignal: signal }),
  })
  const harness = mockChatAgent(agent, { chatId: "chat_sealed" })
  try {
    const key = (await keys.ensureChatContentKey("chat_sealed"))!
    const message: UIMessage = {
      id: "m1",
      role: "user",
      parts: [{ type: "text", text: "Remind me about the dentist" }],
    }
    const sealed = seal.sealMessage(message, "chat_sealed", key)
    assert.doesNotMatch(JSON.stringify(sealed), /dentist/)

    await harness.sendMessage(sealed)

    const prompt = JSON.stringify(mock.doStreamCalls[0].prompt)
    assert.match(prompt, /Remind me about the dentist/)
    assert.doesNotMatch(prompt, /data-sealed/)
    const stored = storage.transcript("chat_sealed")
    const user = stored?.entries.find((entry) => entry.id === "m1")?.message
    assert.deepEqual(user?.parts, message.parts)
  } finally {
    await harness.close()
  }
})
