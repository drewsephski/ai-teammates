// Read-only live contract probe. Requires an explicitly designated test account
// and sample spreadsheet; never discovers or selects a production user's data.
// pnpm exec tsx --env-file=.env.local scripts/verify-pulse-sheets.ts \
//   --test-user <id> --test-account <id> --spreadsheet <sample-id> --sample-only
import assert from "node:assert/strict"
import { parseArgs } from "node:util"
import { Composio } from "@composio/core"
import {
  completedData,
  readTrackerSheet,
  TRACKER_READ_SLUG,
  trackerTab,
} from "../lib/tracker-sheets"
import {
  quoteSheet,
  rangeOrigin,
  spreadsheetIdFrom,
} from "../lib/tracker-review"

const { values: args } = parseArgs({
  options: {
    "test-user": { type: "string" },
    "test-account": { type: "string" },
    spreadsheet: { type: "string" },
    "sample-only": { type: "boolean", default: false },
  },
})
assert.ok(
  args["sample-only"] && args["test-user"] && args["test-account"],
  "Explicit dedicated test user/account and --sample-only are required"
)
const spreadsheetId = spreadsheetIdFrom(args.spreadsheet ?? "")
assert.ok(spreadsheetId, "Pass an explicitly designated sample spreadsheet ID")
let phase = "account validation"
const evidence: { tool: string; logId?: string; completed: boolean }[] = []
async function main() {
  const testUser = args["test-user"]
  const testAccount = args["test-account"]
  assert.ok(testUser && testAccount && spreadsheetId)

  const client = new Composio()
  const accounts = await client.connectedAccounts.list({
    userIds: [testUser],
    statuses: ["ACTIVE"],
    limit: 100,
  })
  assert.ok(
    accounts.items.some(
      (account) =>
        account.id === testAccount &&
        account.toolkit.slug === "googlesheets" &&
        !account.isDisabled
    ),
    "The test account is not an active Sheets account for that test user"
  )
  const session = await client.create(testUser, {
    toolkits: { enable: ["googlesheets"] },
    connectedAccounts: { googlesheets: [testAccount] },
    tags: { enable: ["readOnlyHint"], disable: ["destructiveHint"] },
    manageConnections: { enable: false },
    sandbox: { enable: false },
  })
  const execute = async (slug: string, input: Record<string, unknown>) => {
    const result = await session.execute(slug, input)
    evidence.push({
      tool: slug,
      logId: result.logId,
      completed: result.resultType === "completed" && !result.error,
    })
    return result
  }
  // Omitted-tab reads may pad cells that explicit-tab reads omit. Normalize only
  // trailing blanks, preserving internal blank rows and their physical addresses.
  const normalize = (values: unknown[][] = []) => {
    const rows = values.map((row) => {
      const copy = [...row]
      while (copy.length && (copy.at(-1) === "" || copy.at(-1) == null))
        copy.pop()
      return copy
    })
    while (rows.length && !rows.at(-1)!.length) rows.pop()
    return rows
  }
  phase = "tab metadata"
  const tab = await trackerTab(execute, spreadsheetId)
  assert.ok(
    tab.gridProperties.rowCount <= 1000 && tab.gridProperties.columnCount <= 26,
    "Use a small sample sheet for the unbounded omitted-tab probe"
  )
  const input = {
    spreadsheet_id: spreadsheetId,
    majorDimension: "ROWS",
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  }
  // Establish actual provider behavior rather than trusting its documented default.
  let omitted: Record<string, unknown> | undefined
  let omittedFailure = false
  try {
    omitted = completedData(await execute(TRACKER_READ_SLUG, input))
  } catch {
    omittedFailure = true
  }
  phase = "explicit-tab read"
  const explicit = completedData(
    await execute(TRACKER_READ_SLUG, {
      ...input,
      ranges: [quoteSheet(tab.title)],
    })
  )
  assert.equal(explicit.spreadsheetId, spreadsheetId)
  const explicitRanges = explicit.valueRanges as {
    range: string
    values?: unknown[][]
  }[]
  assert.equal(explicitRanges.length, 1)
  assert.equal(rangeOrigin(explicitRanges[0].range).sheet, tab.title)
  assert.ok(
    explicitRanges[0].values?.length,
    "The sample sheet must contain test data"
  )
  if (omitted) {
    assert.equal(omitted.spreadsheetId, spreadsheetId)
    // Empty omitted-tab output is provider behavior the metadata fallback avoids.
    const ranges = omitted.valueRanges as {
      range: string
      values?: unknown[][]
    }[]
    assert.ok(Array.isArray(ranges))
    if (ranges.length) {
      assert.equal(ranges.length, 1)
      assert.equal(rangeOrigin(ranges[0].range).sheet, tab.title)
      phase = "omitted and explicit cell equivalence"
      assert.deepEqual(
        normalize(ranges[0].values),
        normalize(explicitRanges[0].values)
      )
    }
  }
  phase = "resolved bounded read"
  const resolved = await readTrackerSheet(execute, spreadsheetId)
  assert.equal(resolved.sheetId, tab.sheetId)
  assert.deepEqual(
    normalize(resolved.values),
    normalize(explicitRanges[0].values)
  )
  assert.ok(
    evidence.every((call) => call.logId),
    "Provider evidence must include Composio log IDs"
  )
  console.log(
    JSON.stringify(
      {
        passed: true,
        omittedFailure,
        omittedRanges: (omitted?.valueRanges as unknown[] | undefined)?.length,
        omittedPaddingDiffers:
          JSON.stringify(
            (
              omitted?.valueRanges as { values?: unknown[][] }[] | undefined
            )?.[0]?.values
          ) !== JSON.stringify(explicitRanges[0].values),
        resolvedTabId: resolved.sheetId,
        rows: resolved.values.length,
        evidence,
      },
      null,
      2
    )
  )
}
main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      passed: false,
      phase,
      errorType: error instanceof Error ? error.name : "unknown",
      evidence,
    })
  )
  console.error(
    "Live sample Sheets verification failed. Inspect the designated sample and Composio logs before rerunning. No write tools are used by this probe."
  )
  process.exitCode = 1
})
