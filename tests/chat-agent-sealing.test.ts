import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { chat, memoryTranscriptStorage } from "@trigger.dev/sdk/ai"
import { mockChatAgent } from "@trigger.dev/sdk/ai/test"
import { simulateReadableStream, type UIMessage } from "ai"
import { MockLanguageModelV4 } from "ai/test"

import {
  assertWorkerChatSession,
  bindChatSessionStorage,
} from "../lib/chat-session-context"

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
    storage: bindChatSessionStorage(storage),
    onValidateMessages: ({ chatId, messages }) => {
      assertWorkerChatSession(chatId)
      return keys.openChatMessages(chatId, messages)
    },
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

async function attachmentAgent(
  id: string,
  storage: ReturnType<typeof memoryTranscriptStorage>
) {
  const files = await import("../lib/chat-attachments")
  const mock = model()
  const agent = chat.agent({
    id,
    storage: bindChatSessionStorage(storage),
    tools: async () => {
      files.resetChatAttachmentInput()
      return {}
    },
    onValidateMessages: ({ chatId, messages }) =>
      files.validateWorkerChatMessages(chatId, messages),
    run: async ({ chatId, messages, signal, streamText }) => {
      const hydrated = await files.hydrateChatAttachments(
        "user_s",
        chatId,
        messages,
        { requiredIds: files.currentChatAttachmentIds() }
      )
      return streamText({
        model: mock,
        messages: hydrated,
        abortSignal: signal,
      })
    },
    onTurnComplete: async () => {
      await files.recoverRejectedChatAttachmentInput()
      chat.endRun()
    },
  })
  return { agent, mock, files }
}

test("worker opens, validates and pins sealed uploads before generation and SDK persistence", async () => {
  const storage = memoryTranscriptStorage()
  const { agent, mock, files } = await attachmentAgent(
    "validated-file",
    storage
  )
  const file = await files.storeChatAttachment("user_s", "chat_sealed", {
    filename: "brief.txt",
    mediaType: "text/plain",
    bytes: Buffer.from("Accepted file contents"),
  })
  const key = (await keys.ensureChatContentKey("chat_sealed"))!
  const input: UIMessage = {
    id: "file-input",
    role: "user",
    parts: [
      {
        type: "file",
        filename: file.filename,
        mediaType: file.mediaType,
        url: file.url,
      },
    ],
  }
  const harness = mockChatAgent(agent, { chatId: "chat_sealed" })
  try {
    await harness.sendMessage(seal.sealMessage(input, "chat_sealed", key))
    await harness.waitForExit()
    assert.equal(mock.doStreamCalls.length, 1)
    assert.match(
      JSON.stringify(mock.doStreamCalls[0].prompt),
      /Accepted file contents/
    )
    assert.match(
      JSON.stringify(storage.transcript("chat_sealed")),
      new RegExp(file.id)
    )
    assert.doesNotMatch(
      JSON.stringify(storage.transcript("chat_sealed")),
      /Accepted file contents/
    )
    await assert.rejects(
      files.discardChatAttachment("user_s", "chat_sealed", file.id),
      /already part/
    )
  } finally {
    await harness.close()
  }
})

for (const kind of ["missing", "foreign", "external"] as const) {
  test(`worker rejects ${kind} input before the model and a later text turn succeeds`, async () => {
    const { db } = await import("../db")
    const schema = await import("../db/schema")
    const chatId = `reject_${kind}`
    await db.insert(schema.chats).values({ id: chatId, userId: "user_s" })
    const storage = memoryTranscriptStorage()
    const setup = await attachmentAgent(`reject-file-${kind}`, storage)
    const file = await setup.files.storeChatAttachment(
      "user_s",
      kind === "foreign" ? "chat_sealed" : chatId,
      {
        filename: "rejected.txt",
        mediaType: "text/plain",
        bytes: Buffer.from("Never sent to the model"),
      }
    )
    if (kind === "missing")
      await setup.files.discardChatAttachment("user_s", chatId, file.id)
    const input: UIMessage = {
      id: "rejected-input",
      role: "user",
      parts: [
        {
          type: "file",
          filename: file.filename,
          mediaType: file.mediaType,
          url: kind === "external" ? "https://example.com/private" : file.url,
        },
      ],
    }
    const harness = mockChatAgent(setup.agent, { chatId })
    try {
      const result = await harness.sendMessage(input)
      await harness.waitForExit()
      assert.equal(setup.mock.doStreamCalls.length, 0)
      assert.ok(result.chunks.some((chunk) => chunk.type === "error"))
      assert.ok(
        !storage
          .transcript(chatId)
          ?.entries.some((entry) => entry.id === input.id)
      )
    } finally {
      await harness.close()
    }
    const next = await attachmentAgent(`recover-file-${kind}`, storage)
    const resumed = mockChatAgent(next.agent, { chatId, continuation: true })
    try {
      await resumed.sendMessage({
        id: "next-text",
        role: "user",
        parts: [{ type: "text", text: "Carry on without it" }],
      })
      await resumed.waitForExit()
      assert.equal(next.mock.doStreamCalls.length, 1)
      assert.match(
        JSON.stringify(next.mock.doStreamCalls[0].prompt),
        /Carry on without it/
      )
    } finally {
      await resumed.close()
    }
  })
}

test("a text-only turn reaches the fake model despite an unavailable historical upload", async () => {
  const storage = memoryTranscriptStorage()
  const setup = await attachmentAgent("history-file-recovery", storage)
  const file = await setup.files.storeChatAttachment("user_s", "chat_sealed", {
    filename: "old.txt",
    mediaType: "text/plain",
    bytes: Buffer.from("Old draft"),
  })
  const message: UIMessage = {
    id: "old-input",
    role: "user",
    parts: [
      {
        type: "file",
        filename: file.filename,
        mediaType: file.mediaType,
        url: file.url,
      },
    ],
  }
  await storage.save({ chatId: "chat_sealed", continuation: true } as never, {
    reason: "turn-complete",
    changes: [{ op: "put", message }],
    transcript: {
      entries: [{ id: message.id, final: true, message }],
      state: null,
    },
  })
  await setup.files.discardChatAttachment("user_s", "chat_sealed", file.id)
  const harness = mockChatAgent(setup.agent, {
    chatId: "chat_sealed",
    continuation: true,
  })
  try {
    await harness.sendMessage({
      id: "history-followup",
      role: "user",
      parts: [{ type: "text", text: "Continue with text" }],
    })
    await harness.waitForExit()
    assert.equal(setup.mock.doStreamCalls.length, 1)
    assert.match(
      JSON.stringify(setup.mock.doStreamCalls[0].prompt),
      /Earlier attachment unavailable/
    )
    assert.match(
      JSON.stringify(setup.mock.doStreamCalls[0].prompt),
      /Continue with text/
    )
    assert.doesNotMatch(
      JSON.stringify(storage.transcript("chat_sealed")),
      /Earlier attachment unavailable/
    )
  } finally {
    await harness.close()
  }
})
