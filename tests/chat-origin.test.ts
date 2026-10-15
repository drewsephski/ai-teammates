import assert from "node:assert/strict"
import test from "node:test"

import { delegationSourceId } from "../lib/chat-origin"
import { botActivityFromRuns } from "../lib/workspace-activity"

test("a delegated chat's source comes only from a string sourceChatId", () => {
  assert.equal(
    delegationSourceId(
      { delegationDepth: 1, sourceChatId: "chat_a" },
      "chat_b"
    ),
    "chat_a"
  )
  assert.equal(delegationSourceId({ sourceChatId: 7 }, "chat_b"), undefined)
  assert.equal(delegationSourceId({ sourceChatId: "" }, "chat_b"), undefined)
  // A chat never links back to itself
  assert.equal(
    delegationSourceId({ sourceChatId: "chat_b" }, "chat_b"),
    undefined
  )
  assert.equal(delegationSourceId(undefined, "chat_b"), undefined)
  assert.equal(delegationSourceId("chat_a", "chat_b"), undefined)
})

test("activity only counts runs tagged with the user's own chats", () => {
  const chats = [
    { id: "mine", kind: "direct" as const, botIds: ["bot_a"] },
    { id: "group", kind: "group" as const, botIds: ["bot_a", "bot_b"] },
  ]
  const activity = botActivityFromRuns(chats, [
    { tags: ["chat:someone-else"], status: "EXECUTING" },
    { tags: ["chat:mine"], status: "QUEUED" },
    // A group run names its author; an unknown author marks nobody
    { tags: ["chat:group"], status: "EXECUTING", metadata: { botId: "bot_b" } },
    { tags: ["chat:group"], status: "EXECUTING", metadata: { botId: "bot_x" } },
    { tags: ["chat:mine"], status: "COMPLETED" },
  ])
  assert.deepEqual(
    Object.fromEntries(activity),
    { bot_a: "queued", bot_b: "working" }
  )
})
