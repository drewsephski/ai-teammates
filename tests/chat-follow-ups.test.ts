import assert from "node:assert/strict"
import test from "node:test"
import {
  canSuggestFollowUps,
  followUpContext,
  latestFollowUps,
  parseFollowUps,
} from "../lib/chat-follow-ups"
import type { ChatUIMessage } from "../lib/sandbox-tools"

const suggestions = [
  {
    label: "Try a quieter launch",
    prompt: "Design a small launch for Krafty.",
  },
  {
    label: "Turn it into an experiment",
    prompt: "Test Krafty's launch with five founders.",
  },
]
const reply: ChatUIMessage = {
  id: "reply",
  role: "assistant",
  parts: [
    { type: "text", text: "Here's a launch plan for Krafty." },
    { type: "data-followUps", data: { botId: "bot", suggestions } },
  ],
}

test("follow-ups belong only to the latest assistant reply and survive transcript reload", () => {
  assert.deepEqual(latestFollowUps([JSON.parse(JSON.stringify(reply))]), {
    botId: "bot",
    suggestions,
  })
  const user: ChatUIMessage = {
    id: "user",
    role: "user",
    parts: [{ type: "text", text: "New topic" }],
  }
  assert.equal(latestFollowUps([reply, user]), undefined)
  assert.equal(
    latestFollowUps([
      reply,
      { ...reply, id: "new", parts: [{ type: "text", text: "New answer" }] },
    ]),
    undefined
  )
})

test("invalid, oversized or duplicate model suggestions are not rendered", () => {
  for (const value of [
    null,
    {},
    { suggestions: [{ label: "", prompt: "Hi" }] },
    { suggestions: [{ label: "x".repeat(49), prompt: "Hi" }] },
    { suggestions: [suggestions[0], suggestions[1], suggestions[0]] },
  ])
    assert.deepEqual(parseFollowUps(value), [])
  assert.deepEqual(
    parseFollowUps({
      suggestions: [
        suggestions[0],
        { ...suggestions[0], label: " TRY A QUIETER LAUNCH " },
      ],
    }),
    [suggestions[0]]
  )
  assert.deepEqual(
    parseFollowUps({
      suggestions: [
        suggestions[0],
        { ...suggestions[1], prompt: suggestions[0].prompt.toUpperCase() },
      ],
    }),
    [suggestions[0]]
  )
})

test("follow-up context is bounded and contains prose rather than reasoning or tool payloads", () => {
  const context = followUpContext([
    ...Array.from({ length: 20 }, (_, index): ChatUIMessage => ({
      id: `user-${index}`,
      role: "user",
      parts: [{ type: "text", text: "x".repeat(6000) }],
    })),
    {
      ...reply,
      parts: [
        { type: "reasoning", text: "private reasoning" },
        {
          type: "tool-recall",
          toolCallId: "recall",
          state: "output-error",
          input: {},
          errorText: "private tool payload",
        },
        ...reply.parts,
      ],
    },
  ])
  assert.equal(context.at(-1)?.text, "Here's a launch plan for Krafty.")
  assert.ok(
    context.reduce((total, entry) => total + entry.text.length, 0) <= 16_000
  )
  assert.ok(context.length <= 12)
  assert.doesNotMatch(
    JSON.stringify(context),
    /private reasoning|private tool payload|quieter launch/
  )
})

test("questions, destinations and empty replies do not compete with follow-ups", () => {
  assert.equal(canSuggestFollowUps(undefined), false)
  assert.equal(canSuggestFollowUps({ ...reply, parts: [] }), false)
  assert.equal(
    canSuggestFollowUps({ ...reply, parts: [{ type: "text", text: " " }] }),
    false
  )
  assert.equal(
    canSuggestFollowUps({
      ...reply,
      parts: [
        ...reply.parts,
        {
          type: "tool-askUser",
          toolCallId: "question",
          state: "output-available",
          input: { question: "Which direction?", options: ["A", "B"] },
          output: { question: "Which direction?", options: ["A", "B"] },
        },
      ],
    }),
    false
  )
})
