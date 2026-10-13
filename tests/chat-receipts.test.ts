import assert from "node:assert/strict"
import test from "node:test"
import type { ChatUIMessage } from "../lib/sandbox-tools"
import { seenMessageIds } from "../lib/chat-receipts"

const user: ChatUIMessage = {
  id: "request",
  role: "user",
  parts: [{ type: "text", text: "Hello" }],
}
const receipt: ChatUIMessage = {
  id: "response",
  role: "assistant",
  parts: [
    {
      type: "data-messageSeen",
      data: { messageId: "request", seenAt: "2026-10-13T20:00:00.000Z" },
    },
  ],
}

test("sending a message alone does not imply the bot has seen it", () => {
  assert.equal(seenMessageIds([user]).size, 0)
})
test("agent receipts correlate to the actual user message and survive transcript replay", () => {
  assert.deepEqual([...seenMessageIds([user, receipt])], ["request"])
  assert.deepEqual(
    [...seenMessageIds(JSON.parse(JSON.stringify([user, receipt])))],
    ["request"]
  )
})
test("user-provided data and receipts for another message cannot mark a message seen", () => {
  const forged: ChatUIMessage = { ...receipt, id: "forged", role: "user" }
  assert.equal(seenMessageIds([user, forged]).size, 0)
  assert.equal(seenMessageIds([receipt]).size, 0)
})
