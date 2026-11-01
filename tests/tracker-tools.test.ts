import assert from "node:assert/strict"
import test from "node:test"

import {
  createAppTools,
  TRACKER_READ_SLUG,
  type ApprovalGate,
  type ConnectorRuntime,
} from "../lib/connector-tools"
import { TRACKER_INFO_SLUG } from "../lib/tracker-sheets"
import { pulseExpectations, pulseTrackerValues } from "./helpers/pulse-tracker"

const options = { toolCallId: "call", messages: [], context: {} }
const sheetId = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
const link = `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=0`
// 2026-11-02 01:30 UTC is still Sunday, November 1 in Chicago
const now = () => new Date("2026-11-02T01:30:00Z")

type Call = { slug: string; input: Record<string, unknown>; account: string }

function sheetsRuntime(
  overrides: Partial<ConnectorRuntime> = {},
  calls: Call[] = []
): ConnectorRuntime {
  return {
    accounts: async () => [{ id: "alice-sheets", toolkit: "googlesheets" }],
    search: async () => ({ tools: [], guidance: {} }),
    schema: async () => undefined,
    execute: async (_user, slug, input, account) => {
      calls.push({ slug, input, account: account.id })
      return {
        resultType: "completed",
        error: null,
        data:
          slug === TRACKER_INFO_SLUG
            ? {
                spreadsheetId: sheetId,
                sheets: [
                  {
                    properties: {
                      sheetId: 0,
                      index: 0,
                      title: "Projects",
                      gridProperties: { rowCount: 1000, columnCount: 26 },
                    },
                  },
                ],
              }
            : {
                spreadsheetId: sheetId,
                valueRanges: [
                  {
                    range: "Projects!A1:Z1000",
                    majorDimension: "ROWS",
                    values: pulseTrackerValues("2026-11-01"),
                  },
                ],
              },
      }
    },
    ...overrides,
  }
}

// A gate that fails the test if a read ever asks for approval
const noApprovals: ApprovalGate = {
  required: async () => assert.fail("a read never needs approval"),
  request: async () => assert.fail("a read never asks for approval"),
  claim: async () => undefined,
  complete: async () => {},
}

async function review(
  tools: ReturnType<typeof createAppTools>,
  input: Parameters<NonNullable<typeof tools.reviewTracker.execute>>[0]
) {
  return JSON.parse(
    String(await tools.reviewTracker.execute!(input, options))
  ) as Record<string, unknown> & {
    flagged?: { row: number; flags: string[] }[]
  }
}

test("reviewTracker reads the tab unformatted and flags rows on the owner's date", async () => {
  const calls: Call[] = []
  const tools = createAppTools("alice", sheetsRuntime({}, calls), noApprovals, {
    timeZone: async () => "America/Chicago",
    now,
  })
  const result = await review(tools, { spreadsheet: link, sheet: "Projects" })
  assert.equal(calls[0].slug, TRACKER_INFO_SLUG)
  assert.deepEqual(calls.slice(1), [
    {
      slug: TRACKER_READ_SLUG,
      account: "alice-sheets",
      input: {
        spreadsheet_id: sheetId,
        ranges: ["Projects!A1:Z1000"],
        majorDimension: "ROWS",
        valueRenderOption: "UNFORMATTED_VALUE",
        dateTimeRenderOption: "SERIAL_NUMBER",
      },
    },
  ])
  assert.equal(result.status, "succeeded")
  assert.equal(result.today, "2026-11-01")
  assert.equal(result.timezoneNote, undefined)
  assert.deepEqual(
    result.flagged!.map((row) => row.row),
    pulseExpectations.map((row) => row.row)
  )
  assert.match(String(result.message), /sheet's own row numbers/)
})

test("without a saved timezone the review says it used the UTC date", async () => {
  const tools = createAppTools("alice", sheetsRuntime(), undefined, { now })
  const result = await review(tools, { spreadsheet: sheetId })
  assert.equal(result.today, "2026-11-02")
  assert.match(String(result.timezoneNote), /UTC/)
})

test("the first tab is resolved by metadata index, never an omitted ranges request", async () => {
  const calls: Call[] = []
  const tools = createAppTools("alice", sheetsRuntime({}, calls))
  await review(tools, { spreadsheet: sheetId })
  assert.equal(calls[0].slug, TRACKER_INFO_SLUG)
  assert.deepEqual(calls[1].input.ranges, ["Projects!A1:Z1000"])
})

test("a name or a published link is refused before anything is read", async () => {
  const calls: Call[] = []
  const tools = createAppTools("alice", sheetsRuntime({}, calls))
  for (const spreadsheet of [
    "Website relaunch tracker",
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTabc/pubhtml",
  ]) {
    const result = await review(tools, { spreadsheet })
    assert.equal(result.code, "SPREADSHEET_ID_REQUIRED")
  }
  assert.deepEqual(calls, [])
})

test("no Google Sheets connection, or two of them, stops before reading", async () => {
  const calls: Call[] = []
  const none = createAppTools(
    "alice",
    sheetsRuntime(
      { accounts: async () => [{ id: "alice-gmail", toolkit: "gmail" }] },
      calls
    )
  )
  assert.equal(
    (await review(none, { spreadsheet: sheetId })).code,
    "APP_DISCONNECTED"
  )
  const two = createAppTools(
    "alice",
    sheetsRuntime(
      {
        accounts: async () => [
          { id: "work", toolkit: "googlesheets", label: "work@acme.test" },
          { id: "home", toolkit: "googlesheets", label: "me@home.test" },
        ],
      },
      calls
    )
  )
  const choice = await review(two, { spreadsheet: sheetId })
  assert.equal(choice.status, "requires_input")
  assert.equal(choice.code, "ACCOUNT_CHOICE_REQUIRED")
  assert.equal(calls.length, 0)
  await review(two, { spreadsheet: sheetId, accountId: "home" })
  assert.equal(calls[0].account, "home")
})

test("a failed read is a plain failure, never an unknown outcome", async () => {
  const thrown = createAppTools(
    "alice",
    sheetsRuntime({
      execute: async () => {
        throw new Error("socket hang up")
      },
    })
  )
  const failed = await review(thrown, { spreadsheet: sheetId })
  assert.equal(failed.status, "failed")
  assert.match(String(failed.message), /nothing was changed/)
  const rejected = createAppTools(
    "alice",
    sheetsRuntime({
      execute: async () => ({
        resultType: "failed",
        error: "Requested entity was not found.",
        data: {},
      }),
    })
  )
  const missing = await review(rejected, { spreadsheet: sheetId })
  assert.equal(missing.status, "failed")
  assert.equal(missing.code, "READ_FAILED")
  assert.equal(missing.error, "Requested entity was not found.")
  assert.match(String(missing.message), /share it/)
  assert.equal(missing.flagged, undefined)
})

test("an expired Google connection asks for a reconnect card, not a retry", async () => {
  // Its own user: an expired account is remembered for the worker's life
  const tools = createAppTools(
    "expired-user",
    sheetsRuntime({
      execute: async () => ({
        resultType: "failed",
        error: "invalid_grant: Token has been expired or revoked.",
        data: { status_code: 401 },
      }),
    })
  )
  const expired = await review(tools, { spreadsheet: sheetId })
  assert.equal(expired.status, "failed")
  assert.equal(expired.code, "CONNECTION_EXPIRED")
  assert.deepEqual(expired.reconnect, { toolkit: "googlesheets" })
  assert.match(String(expired.message), /askUser with appConnection/)
  assert.doesNotMatch(String(expired.message), /Retry/)
  // Later reviews in the same turn stop before calling Google again
  const again = await review(tools, { spreadsheet: sheetId })
  assert.equal(again.code, "CONNECTION_EXPIRED")
})

test("find returns a task's row and cells for an exact write", async () => {
  const tools = createAppTools("alice", sheetsRuntime(), undefined, {
    timeZone: async () => "America/Chicago",
    now,
  })
  const result = await review(tools, {
    spreadsheet: sheetId,
    find: ["Homepage copy"],
  })
  assert.deepEqual(result.matches, [
    {
      query: "Homepage copy",
      rows: [
        {
          row: 5,
          task: "Homepage copy",
          values: {
            task: "Homepage copy",
            owner: "Marcus",
            status: "In progress",
            due: "2026-10-29",
            updated: "2026-10-30",
          },
          cells: {
            task: "Projects!B5",
            owner: "Projects!C5",
            status: "Projects!D5",
            due: "Projects!E5",
            updated: "Projects!F5",
          },
        },
      ],
    },
  ])
})
