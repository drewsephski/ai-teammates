import assert from "node:assert/strict"
import test from "node:test"
import type { UIMessage } from "ai"
import { isChatThinking } from "../lib/chat-thinking"

const previous: UIMessage = {
  id: "previous",
  role: "assistant",
  parts: [{ type: "text", text: "Previous answer" }],
}
const user: UIMessage = {
  id: "user",
  role: "user",
  parts: [{ type: "text", text: "Next question" }],
}

test("new setup and submitted turns show thinking; ordinary empty chats do not", () => {
  assert.equal(isChatThinking([], "ready", true), true)
  assert.equal(isChatThinking([], "ready", false), false)
  assert.equal(isChatThinking([previous, user], "submitted", false), true)
  assert.equal(isChatThinking([], "error", true), false)
})

test("thinking persists through hidden reasoning and empty text, then ends at the first visible response", () => {
  const pending: UIMessage = {
    id: "response",
    role: "assistant",
    parts: [
      { type: "reasoning", text: "Consider the request" },
      { type: "text", text: " " },
    ],
  }
  assert.equal(
    isChatThinking([previous, user, pending], "streaming", false),
    true
  )
  const replying: UIMessage = {
    ...pending,
    parts: [{ type: "text", text: "Here's" }],
  }
  assert.equal(
    isChatThinking([previous, user, replying], "streaming", false),
    false
  )
  assert.equal(isChatThinking([previous, user], "ready", false), false)
})

test("a setup question counts as a response once its choices are ready", () => {
  const question: UIMessage = {
    id: "question",
    role: "assistant",
    parts: [
      {
        type: "tool-askUser",
        toolCallId: "choice",
        state: "input-available",
        input: { question: "Choose?", options: ["A", "B"] },
      },
    ],
  }
  assert.equal(isChatThinking([question], "streaming", true), true)
  const displayed: UIMessage = {
    ...question,
    parts: [
      {
        type: "tool-askUser",
        toolCallId: "choice",
        state: "output-available",
        input: {},
        output: { question: "Choose?", options: ["A", "B"] },
      },
    ],
  }
  assert.equal(isChatThinking([displayed], "streaming", true), false)
})
