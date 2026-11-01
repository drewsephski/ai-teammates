import assert from "node:assert/strict"
import test from "node:test"
import {
  createAppTools,
  runClaimedCall,
  type ApprovalGate,
  type ConnectorRuntime,
} from "../lib/connector-tools"
import {
  executeTrackerWrite,
  prepareTrackerWrite,
  readTrackerSheet,
  TRACKER_INFO_SLUG,
  TRACKER_PROOF_KEY,
  TRACKER_READ_SLUG,
  type TrackerSnapshot,
} from "../lib/tracker-sheets"
import { samplePulseSheet } from "./helpers/pulse-tracker"

const today = "2026-11-01"
const slug = "GOOGLESHEETS_UPDATE_VALUES_BATCH"
const options = { toolCallId: "call", messages: [], context: {} }
const account = { id: "safe-test-account", toolkit: "googlesheets" }
const inputFor = (spreadsheetId: string) => ({
  spreadsheet_id: spreadsheetId,
  valueInputOption: "RAW",
  data: [
    { range: "Projects!D5", values: [["Done"]] },
    { range: "Projects!F5", values: [[today]] },
  ],
})
async function fixture() {
  const sheet = samplePulseSheet(today)
  const snapshot: TrackerSnapshot = {
    ...(await readTrackerSheet(sheet.execute, sheet.spreadsheetId)),
    headerRow: 3,
    taskColumn: "B",
    writableColumns: ["C", "D", "E", "F"],
  }
  const input = inputFor(sheet.spreadsheetId)
  const proof = prepareTrackerWrite(slug, input, snapshot)
  const stored = { ...input, [TRACKER_PROOF_KEY]: proof }
  const runtime = {
    execute: async (
      _user: string,
      tool: string,
      args: Record<string, unknown>
    ) => sheet.execute(tool, args),
  }
  return { sheet, snapshot, stored, runtime }
}

test("a write checks headers and target row immediately before execution and reads back every changed and preserved cell", async () => {
  const { sheet, stored, runtime } = await fixture()
  const before = structuredClone(sheet.values)
  const result = (await executeTrackerWrite(
    "sample-user",
    runtime,
    slug,
    stored,
    account
  )) as Record<string, unknown>
  assert.equal(result.verification, "read_back_confirmed")
  assert.equal(sheet.writes, 1)
  before[4][3] = "Done"
  before[4][5] = today
  assert.deepEqual(sheet.values, before)
  assert.deepEqual(
    sheet.calls.map((c) => c.slug),
    [
      TRACKER_INFO_SLUG,
      TRACKER_READ_SLUG,
      TRACKER_INFO_SLUG,
      TRACKER_READ_SLUG,
      slug,
      TRACKER_INFO_SLUG,
      TRACKER_READ_SLUG,
    ]
  )
  assert.equal(
    TRACKER_PROOF_KEY in sheet.calls.find((c) => c.slug === slug)!.input,
    false
  )
})

test("a changed expected value, moved row, renamed header, or replaced tab prevents the write", async () => {
  for (const change of [
    (s: Awaited<ReturnType<typeof fixture>>["sheet"]) => {
      s.values[4][3] = "Blocked"
    },
    (s: Awaited<ReturnType<typeof fixture>>["sheet"]) => {
      s.values[4][1] = "Different task"
    },
    (s: Awaited<ReturnType<typeof fixture>>["sheet"]) => {
      s.values[2][3] = "Priority"
    },
    (s: Awaited<ReturnType<typeof fixture>>["sheet"]) => {
      s.setTab(88)
    },
    (s: Awaited<ReturnType<typeof fixture>>["sheet"]) => {
      s.setTab(7, "Renamed")
    },
  ]) {
    const { sheet, stored, runtime } = await fixture()
    change(sheet)
    const result = (await executeTrackerWrite(
      "sample-user",
      runtime,
      slug,
      stored,
      account
    )) as Record<string, unknown>
    assert.equal(result.code, "TRACKER_CHANGED")
    assert.equal(sheet.writes, 0)
  }
})

test("timeouts after commit are read back and never retried or reported as a confirmed write", async () => {
  const { sheet, stored, runtime } = await fixture()
  const result = (await executeTrackerWrite(
    "sample-user",
    {
      execute: async (...args) => {
        const result = await runtime.execute(args[0], args[1], args[2])
        if (args[1] === slug) throw new Error("timeout after commit")
        return result
      },
    },
    slug,
    stored,
    account
  )) as Record<string, unknown>
  assert.equal(result.code, "OUTCOME_UNKNOWN")
  assert.equal(result.verification, "read_back_matches_after_unknown")
  assert.equal(sheet.writes, 1)
  assert.equal(sheet.calls.at(-1)!.slug, TRACKER_READ_SLUG)
})

test("a success receipt cannot hide wrong targets, missing read-back, or collateral edits", async () => {
  for (const fault of ["receipt", "collateral", "no-change", "read-failure"]) {
    const { sheet, stored, runtime } = await fixture()
    let attempted = false
    const result = (await executeTrackerWrite(
      "sample-user",
      {
        execute: async (...args) => {
          if (attempted && fault === "read-failure")
            throw new Error("read unavailable")
          if (args[1] === slug) {
            attempted = true
            if (fault === "no-change")
              return {
                resultType: "completed",
                data: { spreadsheetId: sheet.spreadsheetId },
              }
            const result = await runtime.execute(args[0], args[1], args[2])
            if (fault === "receipt")
              result.data = { spreadsheetId: "wrong-spreadsheet" }
            if (fault === "collateral")
              sheet.values[4][4] = "overwritten due date"
            return result
          }
          return runtime.execute(args[0], args[1], args[2])
        },
      },
      slug,
      stored,
      account
    )) as Record<string, unknown>
    assert.equal(result.code, "OUTCOME_UNKNOWN", fault)
    assert.equal(
      sheet.calls.filter((c) => c.slug === slug).length,
      fault === "no-change" ? 0 : 1
    )
    assert.ok(attempted)
  }
})

test("unsafe edits and ambiguous task identities cannot be prepared", async () => {
  const { sheet, snapshot } = await fixture()
  const input = inputFor(sheet.spreadsheetId)
  for (const bad of [
    { ...input, valueInputOption: "USER_ENTERED" },
    { ...input, data: [{ range: "D5", values: [["Done"]] }] },
    {
      ...input,
      data: [
        {
          range: "Projects!D5:F5",
          values: [["Done", snapshot.values[4][4], today]],
        },
      ],
    },
    { ...input, data: [{ range: "Projects!D5:F5", values: [["Done"]] }] },
    {
      ...input,
      data: [
        { range: "Projects!D5", values: [["Done"]], majorDimension: "COLUMNS" },
      ],
    },
    { ...input, data: [input.data[0], input.data[0]] },
    { ...input, data: [{ range: "Projects!D3", values: [["Done"]] }] },
    { ...input, data: [{ range: "Projects!D999", values: [["Done"]] }] },
  ])
    assert.throws(() => prepareTrackerWrite(slug, bad, snapshot))
  snapshot.values[5][1] = snapshot.values[4][1]
  assert.throws(() => prepareTrackerWrite(slug, input, snapshot), /duplicated/)
})

test("approved execution refuses legacy missing preconditions and changed accounts", async () => {
  const { sheet, stored, runtime } = await fixture()
  const completions: unknown[] = []
  for (const input of [inputFor(sheet.spreadsheetId), stored]) {
    const result = await runClaimedCall(
      "sample-user",
      { ...runtime, accounts: async () => (input === stored ? [] : [account]) },
      async (_id, value) => {
        completions.push(value)
      },
      "apr_sample",
      { slug, toolkit: "googlesheets", accountId: account.id, input }
    )
    assert.equal(result.ok, false)
  }
  assert.equal(completions.length, 2)
  assert.equal(sheet.writes, 0)
})

function appFixture(required = true) {
  const sheet = samplePulseSheet(today)
  const held: Parameters<ApprovalGate["request"]>[0][] = []
  const tool = {
    slug,
    toolkit: "googlesheets",
    description: "sample batch",
    inputSchema: { type: "object", additionalProperties: true },
  }
  const runtime: ConnectorRuntime = {
    accounts: async () => [account],
    schema: async () => tool,
    search: async () => ({ tools: [tool], guidance: {} }),
    execute: async (_user, name, input) => sheet.execute(name, input),
  }
  const gate: ApprovalGate = {
    required: async () => required,
    request: async (call) => {
      held.push(call)
      return { approvalId: "apr_sample", summary: call.summary ?? "Edit" }
    },
    claim: async () => held.shift(),
    complete: async () => {},
  }
  const tools = createAppTools("sample-user", runtime, gate, {
    now: () => new Date(`${today}T12:00:00Z`),
  })
  const edit = async () =>
    JSON.parse(
      String(
        await tools.executeAppTool.execute!(
          { slug, arguments: inputFor(sheet.spreadsheetId) },
          options
        )
      )
    )
  return { sheet, held, tools, edit, runtime }
}

test("writes need a fresh review, store server preconditions, and are rechecked after approval", async () => {
  const { sheet, tools, held, edit } = appFixture()
  await tools.getAppToolSchema.execute!({ slug }, options)
  assert.equal((await edit()).code, "TRACKER_REVIEW_REQUIRED")
  await tools.reviewTracker.execute!(
    { spreadsheet: sheet.spreadsheetId },
    options
  )
  assert.equal((await edit()).status, "approval_required")
  assert.equal((await edit()).code, "APPROVAL_ALREADY_REQUESTED")
  assert.ok(held[0].input[TRACKER_PROOF_KEY])
  assert.equal(sheet.writes, 0)
  sheet.values[4][3] = "Someone edited this"
  const ran = JSON.parse(
    String(
      await tools.runApprovedAction.execute!(
        { approvalId: "apr_sample" },
        options
      )
    )
  )
  assert.equal(ran.code, "TRACKER_CHANGED")
  assert.equal(sheet.writes, 0)
})

test("standing rules still verify once, and a stale re-review invalidates a previous mapping", async () => {
  const direct = appFixture(false)
  await direct.tools.getAppToolSchema.execute!({ slug }, options)
  await direct.tools.reviewTracker.execute!(
    { spreadsheet: direct.sheet.spreadsheetId },
    options
  )
  assert.equal((await direct.edit()).verification, "read_back_confirmed")
  assert.equal((await direct.edit()).code, "WRITE_ALREADY_ATTEMPTED")
  assert.equal(direct.sheet.writes, 1)
  const stale = appFixture()
  await stale.tools.getAppToolSchema.execute!({ slug }, options)
  await stale.tools.reviewTracker.execute!(
    { spreadsheet: stale.sheet.spreadsheetId },
    options
  )
  await stale.tools.reviewTracker.execute!(
    { spreadsheet: stale.sheet.spreadsheetId, columns: { status: "X" } },
    options
  )
  assert.equal((await stale.edit()).code, "TRACKER_REVIEW_REQUIRED")
  assert.equal(stale.held.length, 0)
})

test("tab resolution uses index zero even when metadata is reordered and quotes special names", async () => {
  const sheet = samplePulseSheet(today)
  const title = "Bob's plan"
  sheet.setTab(7, title)
  const execute = async (slug: string, input: Record<string, unknown>) => {
    const result = await sheet.execute(slug, input)
    if (slug === TRACKER_INFO_SLUG) {
      const data = result.data as { sheets: unknown[] }
      data.sheets.unshift({
        properties: {
          sheetId: 18,
          title: "Other",
          index: 1,
          gridProperties: { rowCount: 1000, columnCount: 26 },
        },
      })
    }
    return result
  }
  const result = await readTrackerSheet(execute, sheet.spreadsheetId)
  assert.equal(result.sheetId, 7)
  assert.equal(result.range, "'Bob''s plan'!A1:Z1000")
  assert.deepEqual(sheet.calls.at(-1)!.input.ranges, ["'Bob''s plan'!A1:Z1000"])
})

test("malformed, incomplete or misdirected provider reads never become a writable snapshot", async () => {
  for (const fault of [
    "empty",
    "spreadsheet",
    "tab",
    "origin",
    "end",
    "dimension",
    "rows",
    "rejected",
  ]) {
    const sheet = samplePulseSheet(today)
    await assert.rejects(
      () =>
        readTrackerSheet(async (slug, input) => {
          const result = await sheet.execute(slug, input)
          if (slug === TRACKER_READ_SLUG) {
            const data = result.data as {
              spreadsheetId: string
              valueRanges: {
                range: string
                majorDimension: string
                values: unknown
              }[]
              successful?: boolean
            }
            if (fault === "empty") data.valueRanges = []
            if (fault === "spreadsheet") data.spreadsheetId = "another-sheet"
            if (fault === "tab") data.valueRanges[0].range = "Other!A1:Z1000"
            if (fault === "origin")
              data.valueRanges[0].range = "Projects!B2:Z1000"
            if (fault === "end") data.valueRanges[0].range = "Projects!A1:Z999"
            if (fault === "dimension")
              data.valueRanges[0].majorDimension = "COLUMNS"
            if (fault === "rows") data.valueRanges[0].values = ["not a row"]
            if (fault === "rejected") data.successful = false
          }
          return result
        }, sheet.spreadsheetId),
      () => true,
      fault
    )
  }
})

test("concurrent approved calls serialize, so a second stale approval never overwrites the first", async () => {
  const { sheet, stored, runtime } = await fixture()
  let tail = Promise.resolve()
  const locked: ConnectorRuntime["withTrackerWriteLock"] = async (
    _id,
    operation
  ) => {
    const prior = tail
    let release!: () => void
    tail = new Promise<void>((resolve) => {
      release = resolve
    })
    await prior
    try {
      return await operation(() => {})
    } finally {
      release()
    }
  }
  const results = (await Promise.all(
    [1, 2].map(() =>
      executeTrackerWrite(
        "sample-user",
        { ...runtime, withTrackerWriteLock: locked },
        slug,
        structuredClone(stored),
        account
      )
    )
  )) as Record<string, unknown>[]
  assert.equal(
    results.filter((r) => r.verification === "read_back_confirmed").length,
    1
  )
  assert.equal(results.filter((r) => r.code === "TRACKER_CHANGED").length, 1)
  assert.equal(sheet.writes, 1)
})

test("losing the write lock before the update prevents any write", async () => {
  const { sheet, stored, runtime } = await fixture()
  await assert.rejects(
    () =>
      executeTrackerWrite(
        "sample-user",
        {
          ...runtime,
          withTrackerWriteLock: async (_id, operation) =>
            operation(() => {
              throw new Error("lock lost")
            }),
        },
        slug,
        stored,
        account
      ),
    /lock lost/
  )
  assert.equal(sheet.writes, 0)
})

test("ambiguous re-review cannot fall back to append or find-replace", async () => {
  const sheet = samplePulseSheet(today)
  const name = "GOOGLESHEETS_FIND_REPLACE"
  const tool = {
    slug: name,
    toolkit: "googlesheets",
    description: "sample",
    inputSchema: { type: "object", additionalProperties: true },
  }
  const tools = createAppTools("sample-user", {
    accounts: async () => [account],
    schema: async () => tool,
    search: async () => ({ tools: [tool], guidance: {} }),
    execute: async (_user, slug, args) => sheet.execute(slug, args),
  })
  await tools.getAppToolSchema.execute!({ slug: name }, options)
  await tools.reviewTracker.execute!(
    { spreadsheet: sheet.spreadsheetId, columns: { status: "X" } },
    options
  )
  const result = JSON.parse(
    String(
      await tools.executeAppTool.execute!(
        { slug: name, arguments: { spreadsheet_id: sheet.spreadsheetId } },
        options
      )
    )
  )
  assert.equal(result.code, "TRACKER_EDIT_UNSUPPORTED")
  assert.equal(sheet.writes, 0)
})
