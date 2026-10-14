import assert from "node:assert/strict"
import test from "node:test"
import {
  connectorCallbackSchema,
  connectorCookieName,
  verifyConnectorCallback,
} from "../lib/connector-callback"

const callback = {
  state: "f30f1c88-4fa1-4fc1-bfb1-001c947ca8bc",
  status: "success" as const,
  accountId: "gmail-account",
}
const attempt = JSON.stringify({
  userId: "alice",
  accountId: callback.accountId,
  toolkit: "gmail",
})
const account = {
  id: callback.accountId,
  status: "ACTIVE",
  isDisabled: false,
  toolkit: { slug: "gmail" },
}

test("completion requires the original browser attempt and signed-in owner", async () => {
  for (const [userId, returned, stored] of [
    ["alice", callback, undefined],
    ["alice", callback, "invalid JSON"],
    ["alice", callback, "{}"],
    ["bob", callback, attempt],
    ["alice", { ...callback, accountId: "another-account" }, attempt],
    ["alice", { ...callback, status: "failed" as const }, attempt],
  ] as const) {
    let queried = false
    assert.equal(
      await verifyConnectorCallback(userId, returned, stored, async () => {
        queried = true
        return { items: [account] }
      }),
      false
    )
    assert.equal(queried, false)
  }
})

test("callback success alone cannot confirm an inactive or different account", async () => {
  for (const items of [
    [],
    [{ ...account, status: "INITIATED" }],
    [{ ...account, status: "FAILED" }],
    [{ ...account, isDisabled: true }],
    [{ ...account, id: "different-account" }],
    [{ ...account, toolkit: { slug: "github" } }],
  ]) {
    assert.equal(
      await verifyConnectorCallback("alice", callback, attempt, async () => ({
        items,
      })),
      false
    )
  }
})

test("completion queries the owner and toolkit and follows pagination", async () => {
  const cursors: (string | undefined)[] = []
  assert.equal(
    await verifyConnectorCallback(
      "alice",
      callback,
      attempt,
      async (userId, toolkit, cursor) => {
        assert.equal(userId, "alice")
        assert.equal(toolkit, "gmail")
        cursors.push(cursor)
        return cursor
          ? { items: [account] }
          : { items: [], nextCursor: "next-page" }
      }
    ),
    true
  )
  assert.deepEqual(cursors, [undefined, "next-page"])
})

test("provider errors are surfaced instead of confirming success", async () => {
  await assert.rejects(
    verifyConnectorCallback("alice", callback, attempt, async () => {
      throw new Error("Provider unavailable")
    }),
    /Provider unavailable/
  )
})

test("invalid callback parameters cannot select arbitrary browser cookies", () => {
  assert.equal(
    connectorCallbackSchema.safeParse({ ...callback, state: "sidebar_state" })
      .success,
    false
  )
  assert.equal(
    connectorCallbackSchema.safeParse({ ...callback, accountId: ["account"] })
      .success,
    false
  )
  assert.throws(() => connectorCookieName("sidebar_state"))
  assert.notEqual(
    connectorCookieName(callback.state),
    connectorCookieName("904fd59f-aa8f-41ee-b90b-a908617fe597")
  )
})
