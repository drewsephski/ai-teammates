import assert from "node:assert/strict"
import test from "node:test"

import {
  appToolHighRisk,
  appToolRisk,
  approvalRuleApplies,
  standingRuleAllowed,
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

test("Composio's update and create hints are writes whatever the slug says", () => {
  // Live tags from the Composio catalog, 2026-11-01
  assert.equal(
    appToolRisk("GOOGLESHEETS_FIND_REPLACE", ["updateHint"]),
    "write"
  )
  assert.equal(
    appToolRisk("GOOGLECALENDAR_CALENDAR_LIST_PATCH", [
      "updateHint",
      "idempotentHint",
      "openWorldHint",
    ]),
    "write"
  )
  assert.equal(
    appToolRisk("GOOGLECALENDAR_CALENDAR_LIST_INSERT", [
      "openWorldHint",
      "idempotentHint",
      "createHint",
    ]),
    "write"
  )
  assert.equal(
    appToolRisk("GOOGLESHEETS_BATCH_GET", ["openWorldHint", "readOnlyHint"]),
    "read"
  )
  assert.equal(
    appToolRisk("GOOGLESHEETS_AGGREGATE_COLUMN_DATA", [
      "openWorldHint",
      "readOnlyHint",
    ]),
    "read"
  )
  // Without tags (a failed lookup, or a standing-rule check), find and
  // replace is still a write
  assert.equal(appToolRisk("GOOGLESHEETS_FIND_REPLACE"), "write")
  assert.equal(appToolRisk("GOOGLEDOCS_FIND_AND_REPLACE_TEXT"), "write")
  assert.equal(appToolRisk("GOOGLESHEETS_LOOKUP_SPREADSHEET_ROW"), "read")
})

test("Google Sheets edits can be always allowed; clearing and replacing can't", () => {
  for (const [slug, tags] of [
    ["GOOGLESHEETS_VALUES_UPDATE", ["updateHint", "idempotentHint"]],
    ["GOOGLESHEETS_UPDATE_VALUES_BATCH", ["openWorldHint", "updateHint"]],
    [
      "GOOGLESHEETS_BATCH_UPDATE",
      ["openWorldHint", "updateHint", "createHint"],
    ],
    ["GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND", ["updateHint", "createHint"]],
  ] as const) {
    assert.equal(appToolRisk(slug, tags), "write", slug)
    assert.equal(appToolHighRisk(slug, tags), false, slug)
  }
  for (const [slug, tags] of [
    ["GOOGLESHEETS_FIND_REPLACE", ["updateHint"]],
    ["GOOGLESHEETS_CLEAR_VALUES", ["destructiveHint", "updateHint"]],
    ["GOOGLESHEETS_SPREADSHEETS_VALUES_BATCH_CLEAR", ["destructiveHint"]],
    ["GOOGLESHEETS_DELETE_DIMENSION", ["destructiveHint"]],
    ["GOOGLESHEETS_EXECUTE_SQL", ["destructiveHint", "updateHint"]],
    ["GOOGLESHEETS_UPSERT_ROWS", ["createHint", "updateHint"]],
  ] as const)
    assert.equal(appToolHighRisk(slug, tags), true, slug)
  assert.equal(
    standingRuleAllowed({ kind: "app", toolSlug: "GOOGLESHEETS_FIND_REPLACE" }),
    false
  )
  assert.equal(
    approvalRuleApplies(
      { toolSlug: "GOOGLESHEETS_FIND_REPLACE", accountId: "ca_1" },
      {
        slug: "GOOGLESHEETS_FIND_REPLACE",
        accountId: "ca_1",
        tags: ["updateHint"],
      }
    ),
    false
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

test("high-risk app actions never get a standing rule", () => {
  for (const slug of [
    "GMAIL_SEND_EMAIL",
    "GMAIL_REPLY_TO_THREAD",
    "SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL",
    "LINKEDIN_CREATE_LINKEDIN_POST",
    "GOOGLECALENDAR_DELETE_EVENT",
    "GOOGLEDRIVE_ADD_FILE_SHARING_PREFERENCE",
    "STRIPE_CREATE_PAYMENT_INTENT",
    "QUICKBOOKS_CREATE_JOURNAL_ENTRY",
    "CANVAS_UPDATE_SUBMISSION_GRADE",
    "SCHOOLOGY_UPDATE_GRADES",
    "YAHOO_FANTASY_ADD_ROSTER_PLAYER",
    "ACME_FROBNICATE_WIDGET",
  ])
    assert.equal(appToolHighRisk(slug), true, slug)
  for (const slug of [
    "GITHUB_CREATE_AN_ISSUE",
    "NOTION_UPDATE_PAGE",
    "GOOGLESHEETS_BATCH_UPDATE",
    "TODOIST_CREATE_TASK",
    "GMAIL_FETCH_EMAILS",
  ])
    assert.equal(appToolHighRisk(slug), false, slug)
  assert.equal(appToolHighRisk("NOTION_UPDATE_PAGE", ["destructiveHint"]), true)
})

test("a rule applies only to its own account and to low-risk actions", () => {
  const rule = { toolSlug: "NOTION_UPDATE_PAGE", accountId: "ca_1" }
  assert.equal(
    approvalRuleApplies(rule, {
      slug: "NOTION_UPDATE_PAGE",
      accountId: "ca_1",
    }),
    true
  )
  assert.equal(
    approvalRuleApplies(rule, {
      slug: "NOTION_UPDATE_PAGE",
      accountId: "ca_2",
    }),
    false
  )
  assert.equal(
    approvalRuleApplies(
      { toolSlug: "NOTION_UPDATE_PAGE", accountId: null },
      { slug: "NOTION_UPDATE_PAGE", accountId: "ca_1" }
    ),
    false
  )
  assert.equal(
    approvalRuleApplies(
      { toolSlug: "GMAIL_SEND_EMAIL", accountId: "ca_1" },
      { slug: "GMAIL_SEND_EMAIL", accountId: "ca_1" }
    ),
    false
  )
  assert.equal(
    standingRuleAllowed({ kind: "computer", toolSlug: "COMPUTER_SUBMIT" }),
    false
  )
  assert.equal(
    standingRuleAllowed({ kind: "app", toolSlug: "GMAIL_SEND_EMAIL" }),
    false
  )
  assert.equal(
    standingRuleAllowed({ kind: "app", toolSlug: "NOTION_UPDATE_PAGE" }),
    true
  )
})
