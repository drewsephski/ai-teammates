import assert from "node:assert/strict"
import { test } from "node:test"
import {
  approvalActionLabel,
  approvalPreviewSrc,
  humanizeToolSlug,
} from "../components/approval-text"
import { computerHold } from "../components/computer-hold"
import {
  desktopCloseKind,
  formatClock,
  showComputerClock,
} from "../components/computer-status"
import {
  COMPUTER_APPROVAL_REQUIRED,
  DECLINED_ERROR,
  GUARD_EXHAUSTED_ERROR,
  GUARD_UNAVAILABLE_ERROR,
} from "../lib/computer-approval-policy"
import { DESKTOP_CLOSE } from "../lib/sandbox-policy"

test("tool slugs read as an app and an action", () => {
  assert.equal(humanizeToolSlug("NOTION_UPDATE_PAGE"), "Notion: update page")
  assert.equal(humanizeToolSlug("GMAIL_SEND_EMAIL"), "Gmail: send email")
  assert.equal(humanizeToolSlug("SLACK"), "Slack")
  assert.equal(humanizeToolSlug(""), "")
})

test("only known computer actions get a label", () => {
  assert.equal(approvalActionLabel("submit"), "Submit")
  assert.equal(approvalActionLabel("buy"), "Buy")
  assert.equal(approvalActionLabel("teleport"), undefined)
  assert.equal(approvalActionLabel(null), undefined)
})

test("only image data URLs are shown as previews", () => {
  assert.ok(approvalPreviewSrc("data:image/png;base64,AAAA"))
  assert.equal(approvalPreviewSrc("data:text/html;base64,AAAA"), undefined)
  assert.equal(approvalPreviewSrc("https://example.com/a.png"), undefined)
  assert.equal(approvalPreviewSrc(null), undefined)
})

test("refusals the computer makes on purpose read as status, not failure", () => {
  assert.equal(
    computerHold(
      `${COMPUTER_APPROVAL_REQUIRED} (submit: roster). Nothing was done.`
    )?.summary,
    "Waiting for your approval"
  )
  assert.equal(computerHold(DECLINED_ERROR)?.kind, "declined")
  assert.equal(computerHold(GUARD_UNAVAILABLE_ERROR)?.kind, "unchecked")
  assert.equal(computerHold(GUARD_EXHAUSTED_ERROR)?.kind, "unchecked")
  assert.equal(
    computerHold("That approvalId isn't an approved request for this step.")
      ?.kind,
    "held"
  )
  // A real failure stays a failure
  assert.equal(computerHold("Command not found"), undefined)
  assert.equal(computerHold(undefined), undefined)
})

test("the computer clock reads m:ss and shows when it matters", () => {
  assert.equal(formatClock(272), "4:32")
  assert.equal(formatClock(300), "5:00")
  assert.equal(formatClock(9.9), "0:09")
  assert.equal(formatClock(-3), "0:00")
  assert.equal(showComputerClock("free", 300), true)
  assert.equal(showComputerClock("free", 0), true)
  assert.equal(showComputerClock("paid", 100_000), false)
  assert.equal(showComputerClock("paid", 240), true)
  assert.equal(showComputerClock(null, 240), false)
  assert.equal(showComputerClock("free", null), false)
})

test("gateway close codes separate a spent allowance from an ended session", () => {
  assert.equal(desktopCloseKind(DESKTOP_CLOSE.usageLimit.code), "exhausted")
  assert.equal(desktopCloseKind(DESKTOP_CLOSE.sessionEnded.code), "ended")
  assert.equal(desktopCloseKind(1006), "dropped")
  assert.equal(desktopCloseKind(undefined), "dropped")
})
