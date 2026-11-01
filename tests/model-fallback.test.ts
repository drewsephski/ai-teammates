import assert from "node:assert/strict"
import test from "node:test"
import { APICallError, simulateReadableStream, streamText } from "ai"
import { MockLanguageModelV4, convertReadableStreamToArray } from "ai/test"

import {
  chatModel,
  chatModelBound,
  chatModelCost,
  followUpModel,
  withFallback,
  withoutEarlierImages,
} from "../lib/model"

type StreamPart =
  Awaited<
    ReturnType<MockLanguageModelV4["doStream"]>
  >["stream"] extends ReadableStream<infer T>
    ? T
    : never
type StreamChunks = StreamPart[]

const finish = {
  type: "finish" as const,
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage: {
    inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 5, text: 5, reasoning: 0 },
  },
}

function answer(text: string): StreamChunks {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t" },
    { type: "text-delta", id: "t", delta: text },
    { type: "text-end", id: "t" },
    finish,
  ]
}

function model(modelId: string, chunks: StreamChunks) {
  return new MockLanguageModelV4({
    provider: modelId === "claude-haiku-5-5" ? "anthropic" : "neon",
    modelId,
    doStream: async () => ({
      stream: simulateReadableStream<StreamPart>({ chunks }),
    }),
  })
}

function failing(modelId: string, error: unknown) {
  return new MockLanguageModelV4({
    provider: "anthropic",
    modelId,
    doStream: async () => {
      throw error
    },
  })
}

const outOfCredit = new APICallError({
  message: "Your credit balance is too low",
  url: "https://api.anthropic.com/v1/messages",
  requestBodyValues: {},
  statusCode: 400,
})

test("Anthropic answers when it can, and the step is priced as Claude", async () => {
  const fallbacks: unknown[] = []
  const wrapped = withFallback(
    model("claude-haiku-5-5", answer("From Claude")),
    model("glm-5-3-flash", answer("From GLM")),
    (error) => fallbacks.push(error)
  )
  const steps: string[] = []
  const result = streamText({
    model: wrapped,
    prompt: "Hi",
    onStepEnd: ({ model }) => {
      steps.push(model.modelId)
    },
  })
  assert.equal(await result.text, "From Claude")
  assert.deepEqual(steps, ["claude-haiku-5-5"])
  assert.equal(fallbacks.length, 0)
})

test("a failed Anthropic call is answered by the gateway and priced as the gateway model", async () => {
  const fallbacks: unknown[] = []
  const wrapped = withFallback(
    failing("claude-haiku-5-5", outOfCredit),
    model("glm-5-3-flash", answer("From GLM")),
    (error) => fallbacks.push(error)
  )
  const steps: string[] = []
  const result = streamText({
    model: wrapped,
    prompt: "Hi",
    maxRetries: 0,
    onStepEnd: ({ model }) => {
      steps.push(model.modelId)
    },
  })
  assert.equal(await result.text, "From GLM")
  assert.deepEqual(steps, ["glm-5-3-flash"])
  assert.deepEqual(fallbacks, [outOfCredit])
})

test("an error Anthropic streams before any output also falls back", async () => {
  const overloaded = new Error("Overloaded")
  const wrapped = withFallback(
    model("claude-haiku-5-5", [
      { type: "stream-start", warnings: [] },
      {
        type: "response-metadata",
        id: "msg_1",
        modelId: "claude-haiku-5-5",
      },
      { type: "error", error: overloaded },
    ]),
    model("glm-5-3-flash", answer("From GLM")),
    () => {}
  )
  const { stream } = await wrapped.doStream({
    prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
  })
  const parts = await convertReadableStreamToArray(stream)
  assert.ok(
    parts.some(
      (part) => part.type === "text-delta" && part.delta === "From GLM"
    )
  )
  assert.equal(wrapped.modelId, "glm-5-3-flash")
})

test("an error after Anthropic has started answering is not replayed elsewhere", async () => {
  const cut = new Error("Connection reset")
  let fellBack = false
  const wrapped = withFallback(
    model("claude-haiku-5-5", [
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: "Half" },
      { type: "error", error: cut },
    ]),
    model("glm-5-3-flash", answer("From GLM")),
    () => {
      fellBack = true
    }
  )
  const { stream } = await wrapped.doStream({
    prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
  })
  const parts = await convertReadableStreamToArray(stream)
  assert.deepEqual(
    parts.map((part) => part.type),
    ["stream-start", "text-start", "text-delta", "error"]
  )
  assert.equal(fellBack, false)
  assert.equal(wrapped.modelId, "claude-haiku-5-5")
})

test("a cancelled call is not retried on the gateway", async () => {
  const controller = new AbortController()
  controller.abort()
  const abort = new DOMException("Aborted", "AbortError")
  let fellBack = false
  const wrapped = withFallback(
    failing("claude-haiku-5-5", abort),
    model("glm-5-3-flash", answer("From GLM")),
    () => {
      fellBack = true
    }
  )
  await assert.rejects(
    async () =>
      wrapped.doStream({
        prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
        abortSignal: controller.signal,
      }),
    abort
  )
  assert.equal(fellBack, false)
})

test("without an Anthropic key the gateway serves every call", () => {
  const saved = process.env.ANTHROPIC_API_KEY
  try {
    delete process.env.ANTHROPIC_API_KEY
    assert.equal(chatModel([], { anthropic: true }).modelId, "glm-5-3-flash")
    process.env.ANTHROPIC_API_KEY = "  "
    assert.equal(chatModel([], { anthropic: true }).modelId, "glm-5-3-flash")
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    assert.equal(chatModel([], { anthropic: true }).modelId, "claude-haiku-5-5")
    assert.equal(
      chatModel([], { anthropic: true }).provider,
      "anthropic.messages"
    )
  } finally {
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = saved
  }
})

test("Anthropic serves only an account that allows it, even with the key", () => {
  const saved = process.env.ANTHROPIC_API_KEY
  try {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    // Off unless the caller passes the account's permission
    assert.equal(chatModel().modelId, "glm-5-3-flash")
    assert.equal(chatModel([], { anthropic: false }).modelId, "glm-5-3-flash")
    assert.equal(followUpModel().modelId, "glm-5-3-flash")
    assert.equal(followUpModel({ anthropic: false }).modelId, "glm-5-3-flash")
    assert.equal(followUpModel({ anthropic: true }).modelId, "claude-haiku-5-5")
    // An image turn without permission goes to the gateway's vision model
    assert.equal(
      chatModel([
        {
          role: "user",
          content: [
            { type: "file", mediaType: "image/png", data: "iVBORw0KGgo=" },
          ],
        },
      ]).modelId,
      "gpt-5-6-luna"
    )
  } finally {
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = saved
  }
})

function usage(input: number, cacheRead: number, cacheWrite: number) {
  return {
    inputTokens: input,
    outputTokens: 1000,
    totalTokens: input + 1000,
    inputTokenDetails: {
      noCacheTokens: input - cacheRead - cacheWrite,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
    },
    outputTokenDetails: { textTokens: 1000, reasoningTokens: 0 },
  }
}

test("Claude Haiku is priced per request, by its prompt-length tier", () => {
  // 10,000 uncached at $0.10, 60,000 read at $0.01, 30,000 written at $0.125
  // and 1,000 output at $0.50 per million tokens
  assert.equal(
    chatModelCost(usage(100_000, 60_000, 30_000), "claude-haiku-5-5"),
    1000 + 600 + 3750 + 500
  )
  // Above 100K input tokens every rate is five times higher
  assert.equal(
    chatModelCost(usage(100_001, 0, 0), "claude-haiku-5-5"),
    Math.ceil(100_001 * 0.5 + 1000 * 2.5)
  )
  const short = usage(5000, 0, 0)
  assert.equal(
    chatModelBound(short),
    Math.max(
      chatModelCost(short, "claude-haiku-5-5"),
      chatModelCost(short, "glm-5-3-flash"),
      chatModelCost(short, "gpt-5-6-luna")
    )
  )
})

test("Anthropic's prompt shape loses earlier screenshots too", () => {
  const screenshot = {
    type: "file" as const,
    mediaType: "image/png",
    data: { type: "data" as const, data: "AAAA" },
  }
  const toolTurn = (id: string) => ({
    role: "tool" as const,
    content: [
      {
        type: "tool-result" as const,
        toolCallId: id,
        toolName: "viewScreen",
        output: { type: "content" as const, value: [screenshot] },
      },
    ],
  })
  const result = withoutEarlierImages([
    { role: "user", content: [screenshot] },
    toolTurn("1"),
    { role: "user", content: [{ type: "text", text: "And now?" }] },
    toolTurn("2"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ]) as any[]
  assert.equal(result[0].content[0].type, "text")
  assert.equal(result[1].content[0].output.value[0].type, "text")
  // The current turn keeps its screenshot
  assert.equal(result[3].content[0].output.value[0].type, "file")
})

test("Claude is called as Haiku 5.5 at low effort, cached, with stale thinking dropped", async (t) => {
  const saved = process.env.ANTHROPIC_API_KEY
  process.env.ANTHROPIC_API_KEY = "sk-ant-test"
  t.after(() => {
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = saved
  })
  const requests: { url: string; headers: Headers; body: unknown }[] = []
  const events = [
    {
      type: "message_start",
      message: {
        id: "msg_1",
        model: "claude-haiku-5-5",
        usage: { input_tokens: 10, output_tokens: 0 },
      },
    },
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "Hello" },
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: "end_turn" },
      usage: { output_tokens: 1 },
    },
    { type: "message_stop" },
  ]
  t.mock.method(
    globalThis,
    "fetch",
    async (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(url),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)),
      })
      return new Response(
        events
          .map(
            (event) =>
              `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
          )
          .join(""),
        { headers: { "content-type": "text/event-stream" } }
      )
    }
  )

  const result = streamText({
    model: chatModel([], { anthropic: true }),
    system: "You are Quill",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "What's on screen?" },
          { type: "image", image: "AAAA", mediaType: "image/png" },
        ],
      },
    ],
  })
  assert.equal(await result.text, "Hello")
  assert.equal(requests.length, 1)
  const [{ url, headers, body }] = requests
  assert.equal(url, "https://api.anthropic.com/v1/messages")
  assert.match(
    headers.get("anthropic-beta") ?? "",
    /thinking-binding-controls-2026-08-01/
  )
  assert.equal(headers.get("x-api-key"), "sk-ant-test")
  const request = body as {
    model: string
    output_config: unknown
    thinking: unknown
    cache_control: unknown
    messages: { content: { type: string }[] }[]
  }
  assert.equal(request.model, "claude-haiku-5-5")
  assert.deepEqual(request.output_config, { effort: "low" })
  assert.deepEqual(request.thinking, {
    type: "adaptive",
    block_binding: { prefix_mismatch_behavior: "drop_block" },
  })
  assert.deepEqual(request.cache_control, { type: "ephemeral" })
  // Claude reads the screenshot itself
  assert.deepEqual(
    request.messages[0].content.map((part) => part.type),
    ["text", "image"]
  )
})
