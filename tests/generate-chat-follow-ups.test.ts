import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { generateChatFollowUps } from "../lib/generate-chat-follow-ups"

function modelFor(text: string, finish: "stop" | "length" = "stop") {
  return new MockLanguageModelV4({
    doStream: {
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "text" },
          { type: "text-delta", id: "text", delta: text },
          { type: "text-end", id: "text" },
          {
            type: "finish",
            finishReason: { unified: finish, raw: finish },
            usage: {
              inputTokens: {
                total: 20,
                noCache: 20,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: { total: 30, text: 30, reasoning: 0 },
            },
          },
        ],
      }),
    },
  })
}

test("generation supports streaming-only models, bills usage and supplies personalized, tool-free context", async () => {
  const suggestions = [
    {
      label: "Try a founder dinner",
      prompt: "Plan a Krafty demo over dinner with five founders.",
    },
  ]
  const model = modelFor(JSON.stringify({ suggestions }))
  let billed = 0
  const result = await generateChatFollowUps({
    model,
    profile: "Launch partner: Drew prefers small, personal launches.",
    messages: [
      {
        id: "reply",
        role: "assistant",
        parts: [
          { type: "text", text: "Krafty is ready for five founders to try." },
        ],
      },
    ],
    signal: new AbortController().signal,
    onUsage: async (usage) => {
      billed += usage.inputTokens ?? 0
    },
  })
  assert.deepEqual(result, suggestions)
  assert.equal(billed, 20)
  assert.equal(model.doGenerateCalls.length, 0)
  const options = model.doStreamCalls[0]
  assert.equal(options.maxOutputTokens, 1500)
  assert.ok(!options.tools?.length)
  assert.match(
    JSON.stringify(options.prompt),
    /Drew prefers small|five founders/
  )
})

test("malformed or truncated suggestions report failure without losing usage accounting", async () => {
  for (const [text, finish] of [
    ["not json", "stop"],
    [
      JSON.stringify({
        suggestions: [{ label: "Try it", prompt: "Test the launch." }],
      }),
      "length",
    ],
  ] as const) {
    let billed = false
    await assert.rejects(
      generateChatFollowUps({
        model: modelFor(text, finish),
        profile: "",
        messages: [],
        signal: new AbortController().signal,
        onUsage: async () => {
          billed = true
        },
      })
    )
    assert.equal(billed, true)
  }
})

test("production recommendations use GLM with low reasoning and structured output", async () => {
  const originalUrl = process.env.NEON_AI_GATEWAY_BASE_URL
  const originalToken = process.env.NEON_AI_GATEWAY_TOKEN
  process.env.NEON_AI_GATEWAY_BASE_URL = "https://gateway.example.test"
  process.env.NEON_AI_GATEWAY_TOKEN = "test-token"
  const suggestions = [
    { label: "Draft the invite", prompt: "Draft a founder dinner invite." },
    {
      label: "Compare demo formats",
      prompt: "Compare a dinner with one-on-one demos.",
    },
    {
      label: "Try a live task relay",
      prompt: "Design a live task relay for the dinner.",
    },
  ]
  const fetchMock = mock.method(
    globalThis,
    "fetch",
    async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string)
      assert.equal(body.model, "glm-5-3-flash")
      assert.equal(body.reasoning_effort, "low")
      assert.equal(body.max_tokens, 1500)
      assert.equal(body.response_format.type, "json_schema")
      assert.equal(
        body.response_format.json_schema.schema.properties.suggestions.maxItems,
        3
      )
      assert.equal(body.tools, undefined)
      const chunks = [
        {
          choices: [
            {
              index: 0,
              delta: { content: JSON.stringify({ suggestions }) },
              finish_reason: null,
            },
          ],
        },
        {
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 800,
            completion_tokens_details: { reasoning_tokens: 700 },
          },
        },
      ]
      return new Response(
        chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
          "data: [DONE]\n\n",
        {
          headers: { "content-type": "text/event-stream" },
        }
      )
    }
  )
  try {
    let billedOutput = 0
    assert.deepEqual(
      await generateChatFollowUps({
        messages: [],
        profile: "",
        signal: new AbortController().signal,
        onUsage: async (usage) => {
          billedOutput = usage.outputTokens ?? 0
        },
      }),
      suggestions
    )
    assert.equal(fetchMock.mock.callCount(), 1)
    assert.equal(billedOutput, 800)
  } finally {
    fetchMock.mock.restore()
    if (originalUrl === undefined) delete process.env.NEON_AI_GATEWAY_BASE_URL
    else process.env.NEON_AI_GATEWAY_BASE_URL = originalUrl
    if (originalToken === undefined) delete process.env.NEON_AI_GATEWAY_TOKEN
    else process.env.NEON_AI_GATEWAY_TOKEN = originalToken
  }
})

test("suggestion generation obeys the turn's stop signal", async () => {
  const controller = new AbortController()
  controller.abort()
  const model = modelFor('{"suggestions":[]}')
  await assert.rejects(
    generateChatFollowUps({
      model,
      profile: "",
      messages: [],
      signal: controller.signal,
      onUsage: async () => {},
    })
  )
  assert.equal(model.doStreamCalls.length, 0)
})
