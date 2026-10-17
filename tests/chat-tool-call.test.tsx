import "./helpers/avatar-motion"
import "./helpers/css.mjs"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { cleanup, render } from "@testing-library/react"

// next/link reads `self` when it loads, which the DOM helper doesn't define.
Object.defineProperty(globalThis, "self", {
  configurable: true,
  value: globalThis,
})
const { ToolCall, pendingApproval, toolCallText } =
  await import("../components/chat-tool-call")
const { COMPUTER_APPROVAL_REQUIRED, DECLINED_ERROR, GUARD_UNAVAILABLE_ERROR } =
  await import("../lib/computer-approval-policy")

afterEach(cleanup)

type Part = Parameters<typeof toolCallText>[0]
const part = (value: Record<string, unknown>) => value as unknown as Part

const approvalPart = part({
  type: "tool-requestComputerApproval",
  toolCallId: "t1",
  state: "output-available",
  input: {
    action: "submit",
    summary: "Submit the roster",
    hostname: "fantasy.espn.com",
  },
  output: {
    status: "approval_required",
    approvalId: "appr_1",
    summary: "Submit the roster",
    toolkit: "fantasy.espn.com",
    message: "",
  },
})

test("requestComputerApproval has its own labels", () => {
  assert.equal(
    toolCallText(approvalPart),
    "Approval requested: Submit the roster"
  )
  assert.equal(
    toolCallText(
      part({
        type: "tool-requestComputerApproval",
        toolCallId: "t1",
        state: "input-available",
        input: { summary: "Submit the roster" },
      })
    ),
    "Request approval: Submit the roster"
  )
})

test("a held computer request becomes an approval card", () => {
  assert.deepEqual(pendingApproval(approvalPart), {
    approvalId: "appr_1",
    summary: "Submit the roster",
    toolkit: "fantasy.espn.com",
  })
  const view = render(<ToolCall part={approvalPart} />)
  assert.ok(view.getByLabelText("Approval request"))
})

const errored = (errorText: string) =>
  part({
    type: "tool-mouseClick",
    toolCallId: "t2",
    state: "output-error",
    input: { x: 1, y: 2 },
    errorText,
  })

test("steps held for approval are calm status rows, not failures", () => {
  const held = errored(
    `${COMPUTER_APPROVAL_REQUIRED} (submit: roster). Nothing was done.`
  )
  assert.equal(toolCallText(held), "Click mouse: Waiting for your approval")
  const view = render(<ToolCall part={held} />)
  assert.ok(view.getByText("Waiting for your approval"))
  assert.ok(view.getByText("Needs approval"))
  assert.equal(view.queryByText("Failed"), null)
})

test("a declined or unchecked step is not a failure either", () => {
  for (const text of [DECLINED_ERROR, GUARD_UNAVAILABLE_ERROR]) {
    assert.doesNotMatch(toolCallText(errored(text)), /failed/)
    const view = render(<ToolCall part={errored(text)} />)
    assert.equal(view.queryByText("Failed"), null)
    view.unmount()
  }
})

test("a real computer error still reads as a failure", () => {
  const view = render(<ToolCall part={errored("The window closed")} />)
  assert.ok(view.getByText("Failed"))
  assert.match(toolCallText(errored("The window closed")), /\(failed\)/)
})

test("routine rows quote the saved next run", () => {
  const scheduled = part({
    type: "tool-scheduleRoutine",
    toolCallId: "t3",
    state: "output-available",
    input: { title: "Morning digest" },
    output: {
      status: "scheduled",
      routineId: "r1",
      title: "Morning digest",
      when: "Weekdays at 8:00 AM (America/New_York)",
      timezone: "America/New_York",
      enabled: true,
      nextRunAt: "2026-10-19T12:00:00.000Z",
      nextRunLocal: "Mon, Oct 19, 8:00 AM",
      lastRunLocal: null,
      lastStatus: null,
      lastError: null,
    },
  })
  assert.match(toolCallText(scheduled), /Morning digest · Weekdays at 8:00 AM/)
  assert.match(toolCallText(scheduled), /Next: Mon, Oct 19, 8:00 AM/)
})
