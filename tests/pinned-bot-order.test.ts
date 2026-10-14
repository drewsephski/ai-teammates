import assert from "node:assert/strict"
import test from "node:test"
import {
  pinnedBotOrderSchema,
  pinnedBotOrderUpdates,
} from "../lib/pinned-bot-order"

test("pin order rejects duplicates, empty orders and invalid IDs", () => {
  for (const ids of [
    [],
    ["a", "a"],
    [""],
    ["x".repeat(129)],
    Array(1001).fill("a"),
  ])
    assert.equal(pinnedBotOrderSchema.safeParse(ids).success, false)
  assert.deepEqual(pinnedBotOrderSchema.parse(["b", "a"]), ["b", "a"])
})

test("reordering reassigns existing timestamp slots and breaks ties", () => {
  const rows = [
    { id: "a", pinnedAt: new Date(100) },
    { id: "b", pinnedAt: new Date(100) },
    { id: "c", pinnedAt: new Date(500) },
  ]
  assert.deepEqual(pinnedBotOrderUpdates(["c", "a", "b"], rows), [
    { id: "c", pinnedAt: new Date(100) },
    { id: "a", pinnedAt: new Date(101) },
    { id: "b", pinnedAt: new Date(500) },
  ])
  assert.equal(rows[1].pinnedAt.getTime(), 100)
})

test("missing, foreign and unpinned bots cannot be reordered", () => {
  const rows = [{ id: "a", pinnedAt: new Date(100) }]
  assert.throws(
    () => pinnedBotOrderUpdates(["a", "foreign"], rows),
    /Pinned bots changed/
  )
  assert.throws(
    () => pinnedBotOrderUpdates(["foreign"], rows),
    /Pinned bots changed/
  )
  assert.throws(
    () => pinnedBotOrderUpdates(["a"], [{ id: "a", pinnedAt: null }]),
    /Pinned bots changed/
  )
})
