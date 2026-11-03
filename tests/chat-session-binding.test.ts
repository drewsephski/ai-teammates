import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import { after, afterEach, before, mock, test } from "node:test"
import { chat, memoryTranscriptStorage } from "@trigger.dev/sdk/ai"
import { mockChatAgent } from "@trigger.dev/sdk/ai/test"
import { simulateReadableStream, type UIMessage } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import {
  assertWorkerChatSession as guard,
  bindChatSessionStorage,
} from "../lib/chat-session-context"
import { assertChatSessionId } from "../lib/chat-session-policy"
import { startTestDatabase } from "./helpers/test-db"

// Use the installed SDK's exported in-memory input manager. sendMessage itself
// always sets chatId, so alter the actual session record at this lower seam.
// Resolve beside the SDK because pnpm correctly hides its transitive packages.
type Send = (
  session: string,
  io: string,
  data: unknown,
  metadata?: unknown
) => Promise<void>
const sdkRequire = createRequire(
  createRequire(import.meta.url).resolve("@trigger.dev/sdk/package.json")
)
const testModule = sdkRequire
  .resolve("@trigger.dev/core/v3/test")
  .replace("/commonjs/", "/esm/")
const { TestSessionStreamManager } = (await import(
  pathToFileURL(testModule).href
)) as {
  TestSessionStreamManager: { prototype: { __sendFromTest: Send } }
}

function substituteWireId(candidate: unknown) {
  const original = TestSessionStreamManager.prototype.__sendFromTest
  let armed = true
  return mock.method(
    TestSessionStreamManager.prototype,
    "__sendFromTest",
    function (this: unknown, ...args: Parameters<Send>) {
      const data = args[2] as {
        kind?: string
        payload?: Record<string, unknown>
      }
      if (
        armed &&
        data?.kind === "message" &&
        data.payload?.trigger !== "close"
      ) {
        armed = false
        args[2] = { ...data, payload: { ...data.payload, chatId: candidate } }
      }
      return original.apply(this, args)
    }
  )
}

let database: Awaited<ReturnType<typeof startTestDatabase>>
before(async () => {
  database = await startTestDatabase()
  const { db } = await import("../db")
  const { chats } = await import("../db/schema")
  await db.insert(chats).values([
    { id: "bound_a", userId: "owner_a" },
    { id: "bound_a2", userId: "owner_a" },
    { id: "bound_b", userId: "owner_b" },
  ])
})
afterEach(() => mock.restoreAll())
after(async () => {
  await database?.stop()
})
const message = (id: string): UIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text: "Synthetic input" }],
})

function replyModel() {
  return new MockLanguageModelV4({
    doStream: {
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "reply" },
          { type: "text-delta", id: "reply", delta: "Synthetic response" },
          { type: "text-end", id: "reply" },
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

test("SDK characterization: a later wire ID differs while the session handle stays boot-bound", async () => {
  const seen: { candidate: string; trusted: string }[] = []
  const agent = chat.agent({
    id: "binding-characterization",
    storage: memoryTranscriptStorage(),
    run: async ({ chatId, messages, signal, streamText }) => {
      seen.push({ candidate: chatId, trusted: chat.session().id })
      return streamText({ model: replyModel(), messages, abortSignal: signal })
    },
  })
  const harness = mockChatAgent(agent, { chatId: "bound_a" })
  try {
    await harness.sendMessage(message("first"))
    substituteWireId("bound_b")
    await harness.sendMessage(message("second"))
    assert.deepEqual(seen, [
      { candidate: "bound_a", trusted: "bound_a" },
      { candidate: "bound_b", trusted: "bound_a" },
    ])
  } finally {
    await harness.close()
  }
})

async function guardedAgent(id: string, storage = memoryTranscriptStorage()) {
  const { db } = await import("../db")
  const { chats } = await import("../db/schema")
  const { eq } = await import("drizzle-orm")
  const { openChatMessages } = await import("../lib/chat-content-key")
  const effects: string[] = []
  const saved = new Set<number>()
  const waiters = new Map<number, () => void>()
  const waitForSave = (turn: number) =>
    saved.has(turn)
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          waiters.set(turn, resolve)
        })
  let boot!: () => void
  const booted = new Promise<void>((resolve) => {
    boot = resolve
  })
  const agent = chat.agent({
    id,
    storage: bindChatSessionStorage({
      ...storage,
      async save(scope, changes) {
        await storage.save(scope, changes)
        if (changes.reason === "turn-complete") {
          saved.add(scope.turn)
          waiters.get(scope.turn)?.()
        }
      },
    }),
    onBoot: boot,
    onValidateMessages: ({ chatId, messages }) => {
      guard(chatId)
      return openChatMessages(chatId, messages)
    },
    tools: async ({ chatId }) => {
      guard(chatId)
      effects.push(`tools:${chatId}`)
      const row = await db.query.chats.findFirst({
        where: eq(chats.id, chatId),
      })
      assert.ok(row)
      effects.push(`owner:${row.userId}`)
      return {}
    },
    onTurnStart: ({ chatId }) => {
      guard(chatId)
    },
    run: async ({ chatId, messages, signal, streamText }) => {
      guard(chatId)
      effects.push(`model:${chatId}`)
      return streamText({ model: replyModel(), messages, abortSignal: signal })
    },
    onBeforeTurnComplete: ({ chatId }) => {
      guard(chatId)
      effects.push(`settle:${chatId}`)
    },
    onTurnComplete: ({ chatId }) => {
      guard(chatId)
      effects.push(`accounting:${chatId}`)
    },
  })
  return { agent, effects, booted, storage, waitForSave }
}

for (const candidate of ["bound_b", "bound_a2", "nonexistent", "", undefined]) {
  for (const entry of [
    "preload",
    "second",
    "continuation",
    "regenerate",
  ] as const) {
    test(`guard rejects ${String(candidate)} at ${entry} without data access, accounting or transcript writes`, async () => {
      const setup = await guardedAgent(`guard-${entry}-${String(candidate)}`)
      const harness = mockChatAgent(setup.agent, {
        chatId: "bound_a",
        continuation: entry === "continuation",
      })
      try {
        await setup.booted
        if (entry === "second" || entry === "regenerate") {
          await harness.sendMessage(message("valid"))
          await setup.waitForSave(0)
        }
        const before = [...setup.effects]
        const transcriptBefore = JSON.stringify(
          setup.storage.transcript("bound_a")
        )
        const injected = substituteWireId(candidate)
        const result =
          entry === "regenerate"
            ? await harness.sendRegenerate()
            : await harness.sendMessage(message("rejected"))
        assert.ok(injected.mock.callCount() > 0)
        await harness.waitForExit()
        assert.deepEqual(setup.effects, before)
        assert.equal(
          JSON.stringify(setup.storage.transcript("bound_a")),
          transcriptBefore
        )
        assert.equal(setup.storage.transcript("bound_b"), undefined)
        assert.equal(setup.storage.transcript("bound_a2"), undefined)
        const errors = result.chunks.filter((chunk) => chunk.type === "error")
        assert.ok(errors.length > 0)
        for (const error of errors)
          assert.equal(error.errorText, "Invalid chat session")
      } finally {
        await harness.close()
      }
    })
  }
}

test("same-session sealed, legacy, server-origin and continuation inputs retain compatibility", async () => {
  const { ensureChatContentKey } = await import("../lib/chat-content-key")
  const { sealMessage } = await import("../lib/chat-content-seal")
  const storage = memoryTranscriptStorage()
  const key = (await ensureChatContentKey("bound_a"))!
  for (const continuation of [false, true]) {
    const setup = await guardedAgent(`guard-valid-${continuation}`, storage)
    const harness = mockChatAgent(setup.agent, {
      chatId: "bound_a",
      continuation,
    })
    try {
      for (const id of [
        "legacy",
        "routine_job_123",
        "approval_test",
        "continue_1_routine_job_123",
      ]) {
        const input = message(`${id}-${continuation}`)
        await harness.sendMessage(
          id === "legacy" ? input : sealMessage(input, "bound_a", key)
        )
      }
      await harness.sendRegenerate()
      await harness.close()
      assert.equal(
        setup.effects.filter((effect) => effect === "model:bound_a").length,
        5
      )
      assert.equal(
        setup.effects.filter((effect) => effect === "accounting:bound_a")
          .length,
        5
      )
    } finally {
      await harness.close()
    }
  }
})

test("pure policy fails closed on a missing trusted identity without leaking either ID", () => {
  assert.throws(() => guard("bound_a"), { message: "Invalid chat session" })
  for (const trusted of [undefined, null, "", "bound_a"])
    assert.throws(() => assertChatSessionId(trusted, "bound_b"), {
      message: "Invalid chat session",
    })
})

test("another chat's valid ciphertext is rejected before it can be opened", async () => {
  const { ensureChatContentKey } = await import("../lib/chat-content-key")
  const { sealMessage } = await import("../lib/chat-content-seal")
  const key = (await ensureChatContentKey("bound_b"))!
  const setup = await guardedAgent("guard-ciphertext")
  const harness = mockChatAgent(setup.agent, { chatId: "bound_a" })
  try {
    await setup.booted
    const before = [...setup.effects]
    substituteWireId("bound_b")
    await harness.sendMessage(
      sealMessage(message("foreign-sealed"), "bound_b", key)
    )
    await harness.waitForExit()
    assert.deepEqual(setup.effects, before)
    assert.equal(setup.storage.transcript("bound_a"), undefined)
    assert.equal(setup.storage.transcript("bound_b"), undefined)
  } finally {
    await harness.close()
  }
})

test("a legitimate slim assistant tool result survives the session guard and SDK validation", async () => {
  const { tool } = await import("ai")
  const { z } = await import("zod")
  const { openChatMessages } = await import("../lib/chat-content-key")
  const storage = memoryTranscriptStorage()
  let calls = 0
  let resumed = ""
  const agent = chat.agent({
    id: "guard-assistant-tool-result",
    storage: bindChatSessionStorage(storage),
    onValidateMessages: ({ chatId, messages }) => {
      guard(chatId)
      return openChatMessages(chatId, messages)
    },
    tools: ({ chatId }) => {
      guard(chatId)
      return {
        question: tool({ inputSchema: z.object({ question: z.string() }) }),
      }
    },
    run: async ({ chatId, messages, tools, streamText, signal }) => {
      guard(chatId)
      calls++
      if (calls > 1) resumed = JSON.stringify(messages)
      const model =
        calls === 1
          ? new MockLanguageModelV4({
              doStream: {
                stream: simulateReadableStream({
                  chunks: [
                    {
                      type: "tool-call",
                      toolCallId: "question-1",
                      toolName: "question",
                      input: '{"question":"Proceed?"}',
                    },
                    {
                      type: "finish",
                      finishReason: {
                        unified: "tool-calls",
                        raw: "tool-calls",
                      },
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
          : replyModel()
      return streamText({ model, messages, tools, abortSignal: signal })
    },
  })
  const harness = mockChatAgent(agent, { chatId: "bound_a" })
  try {
    const first = await harness.sendMessage(message("question-input"))
    const start = first.chunks.find((chunk) => chunk.type === "start")
    assert.ok(start?.messageId)
    await harness.sendMessage({
      id: start.messageId,
      role: "assistant",
      parts: [
        {
          type: "tool-question",
          toolCallId: "question-1",
          state: "output-available",
          input: { question: "Proceed?" },
          output: "Approved synthetic answer",
        },
      ],
    })
    await harness.close()
    assert.equal(calls, 2)
    assert.match(resumed, /Approved synthetic answer/)
  } finally {
    await harness.close()
  }
})
