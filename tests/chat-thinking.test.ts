import assert from "node:assert/strict"
import test from "node:test"
import type { UIMessage } from "ai"
import { isChatThinking } from "../lib/chat-thinking"
import { seenMessageIds } from "../lib/chat-receipts"
import type { ChatUIMessage } from "../lib/sandbox-tools"

const unseen = new Set<string>()
const seen = new Set(["user"])

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

test("setup shows thinking immediately, but submitted prompts wait for Seen", () => {
  assert.equal(isChatThinking([], "ready", true, unseen), true)
  assert.equal(isChatThinking([], "ready", false, unseen), false)
  assert.equal(
    isChatThinking([previous, user], "submitted", false, unseen),
    false
  )
  assert.equal(isChatThinking([], "error", true, unseen), false)
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
    isChatThinking([previous, user, pending], "streaming", false, seen),
    true
  )
  const replying: UIMessage = {
    ...pending,
    parts: [{ type: "text", text: "Here's" }],
  }
  assert.equal(
    isChatThinking([previous, user, replying], "streaming", false, seen),
    false
  )
  assert.equal(isChatThinking([previous, user], "ready", false, seen), false)
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
  assert.equal(isChatThinking([question], "streaming", true, unseen), true)
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
  assert.equal(isChatThinking([displayed], "streaming", true, unseen), false)
})

test("thinking follows the current prompt's agent receipt, including later turns", () => {
  const prompt: ChatUIMessage = {
    id: "user",
    role: "user",
    parts: [{ type: "text", text: "Hello" }],
  }
  const receipt: ChatUIMessage = {
    id: "receipt",
    role: "assistant",
    parts: [
      {
        type: "data-messageSeen",
        data: { messageId: prompt.id, seenAt: "2026-10-13T20:00:00.000Z" },
      },
    ],
  }
  const acknowledged = [prompt, receipt]
  assert.equal(
    isChatThinking([prompt], "streaming", false, seenMessageIds([prompt])),
    false
  )
  assert.equal(
    isChatThinking(
      acknowledged,
      "streaming",
      false,
      seenMessageIds(acknowledged)
    ),
    true
  )

  const next: ChatUIMessage = { ...prompt, id: "next" }
  const waiting = [...acknowledged, next]
  assert.equal(
    isChatThinking(waiting, "submitted", false, seenMessageIds(waiting)),
    false
  )
  assert.equal(
    isChatThinking(waiting, "streaming", false, seenMessageIds(waiting)),
    false
  )

  const nextReceipt: ChatUIMessage = {
    ...receipt,
    id: "next-receipt",
    parts: [
      {
        type: "data-messageSeen",
        data: { messageId: next.id, seenAt: "2026-10-13T20:01:00.000Z" },
      },
    ],
  }
  const nextAcknowledged = [...waiting, nextReceipt]
  assert.equal(
    isChatThinking(
      nextAcknowledged,
      "streaming",
      false,
      seenMessageIds(nextAcknowledged)
    ),
    true
  )
  assert.equal(
    isChatThinking(
      nextAcknowledged,
      "error",
      false,
      seenMessageIds(nextAcknowledged)
    ),
    false
  )
  assert.equal(
    isChatThinking(
      nextAcknowledged,
      "ready",
      false,
      seenMessageIds(nextAcknowledged)
    ),
    false
  )
})
