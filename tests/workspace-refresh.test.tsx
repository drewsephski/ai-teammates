import "./helpers/dom"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { act, cleanup, render } from "@testing-library/react"
import { WorkspaceRefresh } from "../components/workspace-refresh"

afterEach(cleanup)

test("workspace polling never overlaps and aborts when leaving the page", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] })
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  })
  const signals: AbortSignal[] = []
  let finish!: () => void
  const refresh = (signal: AbortSignal) => {
    signals.push(signal)
    return new Promise<void>((resolve) => {
      finish = resolve
    })
  }
  const view = render(<WorkspaceRefresh refresh={refresh} />)
  assert.equal(signals.length, 1)
  act(() => t.mock.timers.tick(20_000))
  assert.equal(signals.length, 1, "a pending request must not stack more polls")
  assert.equal(
    signals[0].aborted,
    true,
    "optional activity has a bounded deadline"
  )
  await act(async () => {
    finish()
  })
  act(() => t.mock.timers.tick(10_000))
  assert.equal(signals.length, 2)
  view.unmount()
  assert.equal(signals[1].aborted, true)
  finish()
})

test("hidden workspaces do not poll; returning checks immediately", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] })
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "hidden",
  })
  let calls = 0
  render(
    <WorkspaceRefresh
      refresh={async () => {
        calls++
      }}
    />
  )
  act(() => t.mock.timers.tick(30_000))
  assert.equal(calls, 0)
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  })
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"))
  })
  assert.equal(calls, 1)
})
