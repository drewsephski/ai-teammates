import assert from "node:assert/strict"
import test from "node:test"
import { chatActivity, chatAuthorSections } from "../lib/chat-activity"
import type { ChatUIMessage } from "../lib/sandbox-tools"

const user: ChatUIMessage = {
  id: "user",
  role: "user",
  metadata: { botId: "scout" },
  parts: [{ type: "text", text: "Research this" }],
}
const options = {
  botIds: ["scout", "quill"],
  fallbackBotId: "scout",
  seen: new Set(["user"]),
}
const reply = (
  parts: ChatUIMessage["parts"],
  botId = "scout"
): ChatUIMessage => ({
  id: "reply",
  role: "assistant",
  metadata: { botId },
  parts,
})
const activity = (
  parts: ChatUIMessage["parts"],
  status: "ready" | "streaming" | "error" = "streaming"
) => chatActivity([user, reply(parts)], status, options)

test("activity waits for this turn's receipt and never animates previous replies", () => {
  const previous = reply([{ type: "text", text: "Old answer" }])
  assert.equal(
    chatActivity([previous, user], "submitted", { ...options, seen: new Set() })
      .state,
    "queued"
  )
  assert.equal(
    chatActivity([previous, user], "streaming", options).state,
    "thinking"
  )
  assert.equal(chatActivity([previous, user], "ready", options).state, "idle")
  assert.equal(
    chatActivity([], "ready", { ...options, setup: true }).state,
    "thinking"
  )
  assert.equal(
    chatActivity([], "error", { ...options, setup: true }).state,
    "error"
  )
})

test("streamed text, reasoning and tool execution produce distinct states", () => {
  assert.equal(
    activity([{ type: "reasoning", text: "Considering", state: "streaming" }])
      .state,
    "thinking"
  )
  assert.equal(
    activity([{ type: "text", text: "Here's", state: "streaming" }]).state,
    "responding"
  )
  assert.equal(
    activity([
      { type: "text", text: "Here's", state: "done" },
      { type: "step-start" },
    ]).state,
    "thinking"
  )
  const tool: ChatUIMessage["parts"][number] = {
    type: "tool-listTeammates",
    toolCallId: "tool",
    state: "input-available",
    input: {},
  }
  assert.equal(
    activity([{ type: "text", text: "Looking this up", state: "done" }, tool])
      .state,
    "working"
  )
  assert.equal(activity([tool], "error").state, "error")
  assert.equal(activity([tool], "ready").state, "idle")
})

test("handoffs attribute only the current section, including before new text arrives", () => {
  const parts: ChatUIMessage["parts"] = [
    { type: "text", text: "Passing to Quill", state: "done" },
    {
      type: "tool-handoff",
      toolCallId: "handoff",
      state: "output-available",
      input: { botId: "quill", note: "Please draft it" },
      output: { botId: "quill", name: "Quill" },
    },
  ]
  const sections = chatAuthorSections(reply(parts))
  assert.equal(sections[0].botId, "scout")
  assert.equal(sections[1].botId, "quill")
  assert.deepEqual(sections[1].parts, [])
  const next = activity(parts)
  assert.equal(next.botId, "quill")
  assert.equal(next.sectionIndex, 1)
  assert.equal(next.state, "thinking")
  const receipt = reply([
    { type: "data-messageSeen", data: { messageId: "user", seenAt: "now" } },
  ])
  receipt.id = "receipt"
  assert.equal(
    chatActivity([user, reply(parts), receipt], "streaming", options).botId,
    "quill"
  )
  assert.equal(
    activity([...parts, { type: "text", text: "Drafting", state: "streaming" }])
      .state,
    "responding"
  )
  assert.equal(
    chatActivity([user, reply(parts, "unknown")], "streaming", options).botId,
    "quill"
  )
  assert.equal(
    chatActivity(
      [user, reply([{ type: "text", text: "Unknown" }], "unknown")],
      "streaming",
      options
    ).botId,
    undefined
  )
})

test("consultations show each contributor, then restore the requesting author", () => {
  const consult = (botId: string): ChatUIMessage["parts"][number] => ({
    type: "tool-consultTeammate",
    toolCallId: `consult-${botId}`,
    state: "output-available",
    input: { botId, prompt: "Introduce yourself" },
    output: { botId, name: botId, answer: `I'm ${botId}.` },
  })
  const first = consult("quill")
  const second = consult("editor")
  const intro = { type: "text" as const, text: "Asking my teammates." }
  const conclusion = { type: "text" as const, text: "Here is our plan." }
  const parts = [intro, first, second, conclusion]
  const sections = chatAuthorSections(reply(parts))
  assert.deepEqual(
    sections.filter((section) => section.parts.length),
    [
      { botId: "scout", parts: [intro] },
      { botId: "quill", parts: [first] },
      { botId: "editor", parts: [second] },
      { botId: "scout", parts: [conclusion] },
    ]
  )
  assert.deepEqual(
    sections.flatMap((section) => section.parts),
    parts
  )
  // The requester continues thinking after a completed consultation, even
  // before its next text arrives. It must not animate the completed contributor.
  assert.equal(activity([intro, first]).botId, "scout")
  assert.equal(activity([intro, first]).state, "thinking")
  assert.equal(activity(parts).botId, "scout")
  assert.equal(activity(parts).state, "responding")
  assert.equal(activity(parts, "ready").state, "idle")
})

test("unfinished and failed consultations stay with the requester; handoffs still persist", () => {
  const pending: ChatUIMessage["parts"][number] = {
    type: "tool-consultTeammate",
    toolCallId: "consult",
    state: "input-available",
    input: { botId: "quill", prompt: "Review this" },
  }
  assert.equal(chatAuthorSections(reply([pending])).length, 1)
  assert.equal(activity([pending]).botId, "scout")
  assert.equal(activity([pending]).state, "working")
  const failed: ChatUIMessage["parts"][number] = {
    ...pending,
    state: "output-error",
    errorText: "Teammate unavailable",
  }
  assert.equal(chatAuthorSections(reply([failed])).length, 1)
  const handoff: ChatUIMessage["parts"][number] = {
    type: "tool-handoff",
    toolCallId: "handoff",
    state: "output-available",
    input: { botId: "quill", note: "Take over" },
    output: { botId: "quill", name: "Quill" },
  }
  const contribution: ChatUIMessage["parts"][number] = {
    ...pending,
    state: "output-available",
    output: { botId: "editor", name: "Editor", answer: "Reviewed." },
  }
  const sections = chatAuthorSections(reply([handoff, contribution]))
  assert.deepEqual(
    sections.map((section) => section.botId),
    ["scout", "quill", "editor", "quill"]
  )
  assert.equal(activity([handoff, contribution]).botId, "quill")
})

test("unanswered questions stay attentive, but answering or failing ends the waiting state", () => {
  const question = reply([
    {
      type: "tool-askUser",
      toolCallId: "question",
      state: "output-available",
      input: { question: "Which?", options: ["A", "B"] },
      output: { question: "Which?", options: ["A", "B"] },
    },
  ])
  assert.equal(
    chatActivity([user, question], "ready", options).state,
    "waiting"
  )
  assert.equal(
    chatActivity([user, question], "streaming", options).state,
    "waiting"
  )
  assert.equal(chatActivity([user, question], "error", options).state, "error")
  const answer: ChatUIMessage = {
    ...user,
    id: "answer",
    metadata: { questionId: "question", botId: "quill" },
  }
  assert.equal(
    chatActivity([user, question, answer], "submitted", options).state,
    "queued"
  )
  assert.equal(
    chatActivity([user, question, answer], "submitted", options).botId,
    "quill"
  )
})

test("a key card waits for the person until they save the key", () => {
  const input = {
    name: "OPENAI_API_KEY",
    label: "OpenAI API key",
    description: "Create one in your OpenAI dashboard.",
  }
  const card = reply([
    {
      type: "tool-requestSecret",
      toolCallId: "key",
      state: "output-available",
      input,
      output: { state: "requested", ...input },
    },
  ])
  assert.equal(chatActivity([user, card], "ready", options).state, "waiting")
  // Already saved: nothing to wait for
  const saved = reply([
    {
      type: "tool-requestSecret",
      toolCallId: "key",
      state: "output-available",
      input,
      output: { state: "saved", name: input.name, label: input.label },
    },
  ])
  assert.equal(chatActivity([user, saved], "ready", options).state, "idle")
  // The wake message after saving carries the card's toolCallId
  const woke: ChatUIMessage = {
    ...user,
    id: "secret_key",
    metadata: { questionId: "key", botId: "quill" },
  }
  assert.equal(
    chatActivity([user, card, woke], "submitted", options).state,
    "queued"
  )
})

test("data-only receipts and follow-ups do not replace the current response identity", () => {
  const text = reply([{ type: "text", text: "Hello", state: "streaming" }])
  const receipt = reply([
    { type: "data-messageSeen", data: { messageId: "user", seenAt: "now" } },
  ])
  receipt.id = "receipt"
  assert.equal(
    chatActivity([user, text, receipt], "streaming", options).messageId,
    "reply"
  )
  assert.equal(
    chatActivity([user, text, receipt], "streaming", options).state,
    "responding"
  )
  const nextUser = { ...user, id: "next" }
  assert.equal(
    chatActivity([user, text, receipt, nextUser], "submitted", options)
      .messageId,
    undefined
  )
})
