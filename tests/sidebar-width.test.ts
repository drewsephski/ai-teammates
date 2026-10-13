import assert from "node:assert/strict"
import test from "node:test"
import { clampSidebarWidth, readSidebarWidth } from "../lib/sidebar-width"

test("sidebar resizing stays usable and leaves room for the conversation", () => {
  assert.equal(clampSidebarWidth(160), 208)
  assert.equal(clampSidebarWidth(500), 360)
  assert.equal(clampSidebarWidth(320, 768), 288)
  assert.equal(clampSidebarWidth(300.4), 300)
  assert.equal(clampSidebarWidth(NaN), 256)
  assert.equal(clampSidebarWidth(300, NaN), 300)
})
test("saved widths restore while malformed preferences fall back safely", () => {
  assert.equal(readSidebarWidth("300"), 300)
  assert.equal(readSidebarWidth("999"), 360)
  for (const value of [undefined, "", "NaN", "-20", "300px", "256;other=value"])
    assert.equal(readSidebarWidth(value), 256)
})
