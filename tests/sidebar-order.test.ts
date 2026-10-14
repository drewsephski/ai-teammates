import assert from "node:assert/strict"
import test from "node:test"
import { applySidebarOrder, sidebarOrderSchema } from "../lib/sidebar-order"

test("sidebar ordering validates identifiers and rejects duplicates", () => {
  for (const ids of [
    [],
    ["a", "a"],
    [""],
    ["a".repeat(129)],
    Array(1001).fill("a"),
  ])
    assert.equal(sidebarOrderSchema.safeParse(ids).success, false)
  assert.deepEqual(sidebarOrderSchema.parse(["b", "a"]), ["b", "a"])
})
test("saved conversation ordering leaves new items stable and ignores removed items", () => {
  const items = [{ id: "a" }, { id: "new" }, { id: "b" }, { id: "another" }]
  assert.deepEqual(applySidebarOrder(items, ["b", "removed", "a"]), [
    { id: "b" },
    { id: "a" },
    { id: "new" },
    { id: "another" },
  ])
  assert.deepEqual(
    items.map((item) => item.id),
    ["a", "new", "b", "another"]
  )
  assert.deepEqual(applySidebarOrder(items, []), items)
})
