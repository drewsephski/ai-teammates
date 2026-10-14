import assert from "node:assert/strict"
import test from "node:test"
import { botActivityFromRuns } from "../lib/workspace-activity"

const chats = [
  { id: "direct", kind: "direct" as const, botIds: ["scout"] },
  { id: "group", kind: "group" as const, botIds: ["scout", "quill"] },
]

test("workspace activity comes only from active runs in owned chats", () => {
  const result = botActivityFromRuns(chats, [
    { tags: ["chat:direct"], status: "QUEUED" },
    { tags: ["chat:group"], status: "EXECUTING", metadata: { botId: "quill" } },
    {
      tags: ["chat:foreign"],
      status: "EXECUTING",
      metadata: { botId: "scout" },
    },
    { tags: ["chat:direct"], status: "COMPLETED" },
    {
      tags: ["chat:group"],
      status: "EXECUTING",
      metadata: { botId: "foreign" },
    },
  ])
  assert.deepEqual(
    [...result],
    [
      ["scout", "queued"],
      ["quill", "working"],
    ]
  )
})

test("group handoffs mark the actual author; idle and unattributed groups do not invent activity", () => {
  assert.equal(
    botActivityFromRuns(chats, [{ tags: ["chat:group"], status: "EXECUTING" }])
      .size,
    0
  )
  assert.equal(
    botActivityFromRuns(chats, [{ tags: ["chat:direct"], status: "WAITING" }])
      .size,
    0
  )
  const result = botActivityFromRuns(chats, [
    { tags: ["chat:direct"], status: "EXECUTING" },
    { tags: ["chat:group"], status: "QUEUED", metadata: { botId: "scout" } },
  ])
  assert.equal(result.get("scout"), "working")
})
