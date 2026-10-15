import assert from "node:assert/strict"
import test from "node:test"
import { simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"

import type { ForYouRecord } from "../lib/for-you"
import { generateForYou, type ForYouContext } from "../lib/generate-for-you"

function modelReturning(output: unknown, prompts: string[] = []) {
  return new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      prompts.push(JSON.stringify(prompt))
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start" as const, id: "text" },
            {
              type: "text-delta" as const,
              id: "text",
              delta: JSON.stringify(output),
            },
            { type: "text-end" as const, id: "text" },
            {
              type: "finish" as const,
              finishReason: { unified: "stop" as const, raw: "stop" },
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

const records: ForYouRecord[] = [
  {
    id: "gmail:m1",
    toolkit: "gmail",
    sourceId: "m1",
    kind: "email",
    title: "Q4 budget",
    from: "Dana Kim <dana@acme.com>",
    excerpt: "Can you send the revised numbers by Friday?",
    signals: ["unread"],
  },
  {
    id: "googlecalendar:e1",
    toolkit: "googlecalendar",
    sourceId: "e1",
    kind: "event",
    title: "Pricing review",
    when: "2026-10-16T15:00:00Z",
    signals: ["3 other attendees"],
  },
]

const context: ForYouContext = {
  person: {
    name: "Drew",
    emails: ["drew@example.com"],
    timeZone: "America/New_York",
  },
  memory: ["(project) Leading the Q4 pricing migration"],
  bots: [
    { id: "quill", name: "Quill", job: "Writing editor" },
    { id: "atlas", name: "Atlas", job: "Project planner" },
  ],
  recentChats: [],
  feedback: {
    excluded: new Set(),
    started: {},
    dismissed: {},
    recentDismissals: [],
  },
}

const reply = {
  recordId: "gmail:m1",
  category: "reply",
  urgency: "today",
  importance: 5,
  title: "Reply to Dana about the Q4 budget",
  reason: "Dana asked for revised numbers by Friday.",
  prompt: "Draft a reply to Dana Kim's 'Q4 budget' email for me to review.",
  botId: "quill",
  quote: "revised numbers by Friday",
}

test("returns several grounded, ranked suggestions and meters usage", async () => {
  const prompts: string[] = []
  let billed = 0
  const ranked = await generateForYou({
    records,
    context,
    model: modelReturning(
      {
        candidates: [
          {
            ...reply,
            recordId: "googlecalendar:e1",
            category: "meeting_prep",
            urgency: "this_week",
            importance: 3,
            title: "Prep for the pricing review",
            botId: "atlas",
            quote: "Pricing review",
          },
          reply,
        ],
      },
      prompts
    ),
    signal: new AbortController().signal,
    onUsage: async () => {
      billed++
    },
  })
  assert.deepEqual(
    ranked.map((item) => item.record.id),
    ["gmail:m1", "googlecalendar:e1"]
  )
  assert.equal(billed, 1)
  // Personal context reaches the model, raw provider data never does
  assert.match(prompts[0], /Q4 pricing migration/)
  assert.match(prompts[0], /drew@example.com/)
})

test("invented records and quotes never become suggestions", async () => {
  const ranked = await generateForYou({
    records,
    context,
    model: modelReturning({
      candidates: [
        { ...reply, quote: "Dana says this is urgent" },
        { ...reply, recordId: "gmail:not-read" },
      ],
    }),
    signal: new AbortController().signal,
    onUsage: async () => {},
  })
  assert.deepEqual(ranked, [])
})

test("no model call when every record was already acted on", async () => {
  let called = false
  const ranked = await generateForYou({
    records,
    context: {
      ...context,
      feedback: {
        ...context.feedback,
        excluded: new Set(records.map((record) => record.id)),
      },
    },
    model: new MockLanguageModelV4({
      doStream: async () => {
        called = true
        throw new Error("should not be called")
      },
    }),
    signal: new AbortController().signal,
    onUsage: async () => {},
  })
  assert.deepEqual(ranked, [])
  assert.equal(called, false)
})
