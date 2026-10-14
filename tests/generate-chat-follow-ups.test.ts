import assert from "node:assert/strict"
import test from "node:test"
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
  assert.equal(options.maxOutputTokens, 500)
  assert.ok(!options.tools?.length)
  assert.match(
    JSON.stringify(options.prompt),
    /Drew prefers small|five founders/
  )
})

test("malformed or truncated suggestions are discarded without losing usage accounting", async () => {
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
    assert.deepEqual(
      await generateChatFollowUps({
        model: modelFor(text, finish),
        profile: "",
        messages: [],
        signal: new AbortController().signal,
        onUsage: async () => {
          billed = true
        },
      }),
      []
    )
    assert.equal(billed, true)
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
