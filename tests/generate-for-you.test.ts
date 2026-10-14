import assert from "node:assert/strict"
import test from "node:test"
import { simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { createAppTools } from "../lib/connector-tools"
import { generateForYou } from "../lib/generate-for-you"

const suggestion = {
  title: "Draft a launch reply",
  description: "Alex asked for your launch plan.",
  prompt:
    "Draft a reply to Alex about the Krafty launch plan for me to review.",
  botId: "quill",
  toolkit: "gmail",
  sourceId: "message_123",
  sourceQuote: "Krafty launch plan",
}
function modelFor(read: boolean) {
  let call = 0
  return new MockLanguageModelV4({
    doStream: async () => {
      const step = call++
      const final = !read || step >= 2
      const chunks = final
        ? [
            { type: "text-start" as const, id: "text" },
            {
              type: "text-delta" as const,
              id: "text",
              delta: JSON.stringify({ suggestion }),
            },
            { type: "text-end" as const, id: "text" },
          ]
        : [
            {
              type: "tool-call" as const,
              toolCallId: `call-${step}`,
              toolName: step === 0 ? "searchAppTools" : "executeAppTool",
              input: JSON.stringify(
                step === 0
                  ? { query: "Find recent emails needing a reply" }
                  : { slug: "GMAIL_READ_RECENT", arguments: {} }
              ),
            },
          ]
      const finish = final ? ("stop" as const) : ("tool-calls" as const)
      return {
        stream: simulateReadableStream({
          chunks: [
            ...chunks,
            {
              type: "finish" as const,
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
      }
    },
  })
}

test("proactive generation reads real tool results, checks evidence and meters every model step", async () => {
  let executed = 0
  let billed = 0
  const tools = createAppTools("alice", {
    accounts: async () => [{ id: "alice-gmail", toolkit: "gmail" }],
    search: async () => ({
      tools: [
        {
          slug: "GMAIL_READ_RECENT",
          toolkit: "gmail",
          description: "Read recent mail",
          inputSchema: { type: "object", properties: {} },
        },
      ],
      guidance: {},
    }),
    schema: async () => undefined,
    execute: async () => {
      executed++
      return {
        resultType: "completed",
        data: {
          messages: [{ id: "message_123", subject: "Krafty launch plan" }],
        },
      }
    },
  })
  const result = await generateForYou({
    bots: [{ id: "quill", name: "Quill", job: "Writing editor" }],
    apps: ["gmail"],
    tools,
    model: modelFor(true),
    signal: new AbortController().signal,
    onUsage: async () => {
      billed++
    },
  })
  assert.deepEqual(result, suggestion)
  assert.equal(executed, 1)
  assert.equal(billed, 4)
})

test("a model-produced email suggestion without a successful app read is rejected", async () => {
  await assert.rejects(
    generateForYou({
      bots: [{ id: "quill", name: "Quill", job: "Writing editor" }],
      apps: ["gmail"],
      tools: {},
      model: modelFor(false),
      signal: new AbortController().signal,
      onUsage: async () => {},
    }),
    /Connected-app search|No verified connected-app data/
  )
})
