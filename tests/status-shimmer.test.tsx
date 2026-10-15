import "./helpers/dom"
import "./helpers/css.mjs"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { cleanup, render } from "@testing-library/react"

import { avatarStatusInProgress, avatarStatusLabels } from "../lib/avatar-state"

const { Tool, ToolHeader } = await import("../components/ai-elements/tool")

afterEach(cleanup)

test("only states where the bot is busy shimmer", () => {
  const busy = Object.keys(avatarStatusLabels).filter((state) =>
    avatarStatusInProgress(state as keyof typeof avatarStatusLabels)
  )
  assert.deepEqual(busy, ["queued", "thinking", "working", "responding"])
})

test("tool status labels shimmer while preparing or running, not once settled", () => {
  const cases = [
    ["input-streaming", "Preparing", true],
    ["input-available", "Running", true],
    ["output-available", "Done", false],
    ["output-error", "Failed", false],
  ] as const
  for (const [state, label, shimmers] of cases) {
    const view = render(
      <Tool>
        <ToolHeader type="tool-runCommand" state={state} />
      </Tool>
    )
    const text = view.getByText(label)
    // The shimmer clips its moving gradient to the label's text
    assert.equal(
      text.className.includes("bg-clip-text"),
      shimmers,
      `${state} shimmer`
    )
    cleanup()
  }
})
