import assert from "node:assert/strict"
import test from "node:test"

import {
  pushBatches,
  pushMessages,
  unregisteredTokens,
} from "../lib/push-policy"

test("push messages carry the tap target and the approval category", () => {
  const [message] = pushMessages(["ExponentPushToken[a]"], {
    title: "Quill needs your approval",
    body: "Email Sam",
    path: "/chats/c1",
    category: "approval",
    data: { approvalId: "apr_1" },
  })
  assert.equal(message.categoryId, "approval")
  assert.deepEqual(message.data, { path: "/chats/c1", approvalId: "apr_1" })
  assert.equal(
    pushMessages(["t"], { title: "x".repeat(500), body: "y", path: "/" })[0]
      .title.length,
    120
  )
})

test("tokens Expo no longer delivers to are found by position", () => {
  const tokens = ["a", "b", "c"]
  const response = {
    data: [
      { status: "ok" },
      { status: "error", details: { error: "DeviceNotRegistered" } },
      { status: "error", details: { error: "MessageRateExceeded" } },
    ],
  }
  assert.deepEqual(unregisteredTokens(tokens, response), ["b"])
  assert.deepEqual(unregisteredTokens(tokens, { errors: [] }), [])
  assert.deepEqual(pushBatches([1, 2, 3], 2), [[1, 2], [3]])
})
