import assert from "node:assert/strict"
import test from "node:test"

import {
  appToolRisk,
  approvalDecisionPrompt,
  fallbackSummary,
} from "../lib/approval-policy"

test("writes wait for approval and reads don't", () => {
  for (const slug of [
    "GMAIL_SEND_EMAIL",
    "GMAIL_REPLY_TO_THREAD",
    "GITHUB_CREATE_AN_ISSUE",
    "SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL",
    "GOOGLECALENDAR_DELETE_EVENT",
    "NOTION_UPDATE_PAGE",
  ])
    assert.equal(appToolRisk(slug), "write", slug)
  for (const slug of [
    "GMAIL_FETCH_EMAILS",
    "GITHUB_GET_A_PULL_REQUEST_MERGE_STATUS",
    "GOOGLECALENDAR_EVENTS_LIST",
    "SLACK_LIST_ALL_CHANNELS",
    "NOTION_SEARCH_NOTION_PAGE",
  ])
    assert.equal(appToolRisk(slug), "read", slug)
})

test("unknown actions wait, and provider tags win over the name", () => {
  assert.equal(appToolRisk("ACME_FROBNICATE_WIDGET"), "write")
  assert.equal(appToolRisk("ACME_FROBNICATE_WIDGET", ["readOnlyHint"]), "read")
  assert.equal(appToolRisk("GMAIL_FETCH_EMAILS", ["destructiveHint"]), "write")
  assert.equal(
    appToolRisk("GMAIL_SEND_EMAIL", ["readOnlyHint", "destructiveHint"]),
    "write"
  )
})

test("approval prompts name the request and never carry its arguments", () => {
  const approve = approvalDecisionPrompt(
    { id: "apr_1", summary: "Email Sam" },
    "approve"
  )
  assert.match(approve, /runApprovedAction/)
  assert.match(approve, /apr_1/)
  assert.match(
    approvalDecisionPrompt({ id: "apr_1", summary: "Email Sam" }, "always"),
    /always allow/
  )
  const deny = approvalDecisionPrompt(
    { id: "apr_1", summary: "Email Sam" },
    "deny"
  )
  assert.doesNotMatch(deny, /runApprovedAction/)
  assert.match(
    fallbackSummary("GMAIL_SEND_EMAIL", { to: "a@b.c" }),
    /^Send email: /
  )
  assert.ok(fallbackSummary("X_Y", { body: "z".repeat(500) }).length < 200)
})
