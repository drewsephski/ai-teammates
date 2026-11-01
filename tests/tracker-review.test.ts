import assert from "node:assert/strict"
import test from "node:test"

import {
  columnLetter,
  parseTrackerDate,
  quoteSheet,
  rangeOrigin,
  reviewTracker,
  spreadsheetIdFrom,
} from "../lib/tracker-review"
import {
  pulseExpectations,
  pulseTrackerValues,
} from "./helpers/pulse-tracker"

const today = "2026-11-01"

// Google's serial date for an ISO day (days since 1899-12-30)
const serial = (iso: string) =>
  (Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000

test("the sample tracker's flags use the sheet's own row numbers", () => {
  const review = reviewTracker(pulseTrackerValues(today), {
    today,
    range: "Projects!A1:Z1000",
  })
  assert.equal(review.headerRow, 3)
  assert.deepEqual(review.unsure, [])
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(review.columns).map(([role, c]) => [role, c.column])
    ),
    { task: "B", owner: "C", status: "D", due: "E", updated: "F" }
  )
  assert.deepEqual(
    review.flagged.map((row) => ({
      row: row.row,
      ...(row.flags.includes("overdue") && { overdue: true }),
      ...(row.flags.includes("blocked") && { blocked: true }),
      ...(row.flags.includes("stale") && { stale: true }),
    })),
    pulseExpectations
  )
  // Done, Complete and Cancelled rows are past due but not flagged
  assert.equal(review.counts.done, 3)
  assert.equal(review.rowsChecked, 38)
  assert.equal(review.firstDataRow, 4)
  assert.equal(review.lastDataRow, 42)
  assert.deepEqual(review.dueToday, [{ row: 10, task: "Accessibility audit" }])
  assert.deepEqual(review.unreadableDates, [
    { cell: "Projects!E18", value: "TBD" },
  ])
  const pricing = review.flagged.find((row) => row.row === 16)!
  assert.deepEqual(pricing.cells, {
    task: "Projects!B16",
    owner: "Projects!C16",
    status: "Projects!D16",
    due: "Projects!E16",
    updated: "Projects!F16",
  })
  assert.deepEqual(pricing.reasons, [
    "overdue by 2 days (due 2026-10-30)",
    'status "On hold"',
    "no update for 12 days (last 2026-10-20)",
  ])
})

test("a task due today isn't overdue and five quiet days is stale", () => {
  const review = reviewTracker(
    [
      ["Task", "Status", "Due", "Updated"],
      ["Today", "Open", serial(today), serial("2026-10-31")],
      ["Four days", "Open", "", serial("2026-10-28")],
      ["Five days", "Open", "", serial("2026-10-27")],
    ],
    { today }
  )
  assert.deepEqual(
    review.flagged.map((row) => [row.task, row.flags]),
    [["Five days", ["stale"]]]
  )
  assert.deepEqual(review.dueToday, [{ row: 2, task: "Today" }])
})

test("serial, written and text dates parse to the same day", () => {
  for (const value of [
    serial("2026-03-04"),
    serial("2026-03-04") + 0.75,
    "2026-03-04",
    "3/4/2026",
    "03/04/26",
    "Mar 4, 2026",
    "Wednesday, March 4th 2026",
    "4 March 2026",
  ])
    assert.equal(parseTrackerDate(value, today)?.iso, "2026-03-04", String(value))
  assert.equal(parseTrackerDate("3/4/2026", today, "dmy")?.iso, "2026-04-03")
  assert.equal(parseTrackerDate("3/4/2026", today)?.ambiguous, true)
  assert.equal(parseTrackerDate("Nov 3", today)?.iso, "2026-11-03")
  assert.equal(parseTrackerDate("Dec 30", "2027-01-02")?.iso, "2026-12-30")
  assert.equal(parseTrackerDate("Nov 3", today)?.yearAssumed, true)
  for (const value of ["TBD", "", "2/30/2026", 7, true, null, "next week"])
    assert.equal(parseTrackerDate(value, today), undefined, String(value))
})

test("a column with a day over 12 reads every date day first", () => {
  const review = reviewTracker(
    [
      ["Task", "Owner", "Status", "Deadline"],
      ["UK date", "Ana", "Open", "25/10/2026"],
      ["Ambiguous", "Ana", "Open", "3/11/2026"],
    ],
    { today }
  )
  // 3/11 is 3 November, not March 11, so it isn't overdue
  assert.deepEqual(
    review.flagged.map((row) => row.row),
    [2]
  )
  assert.ok(!review.unsure.some((line) => line.includes("month first")))
})

test("undecidable text dates are read month first and the person is asked", () => {
  const review = reviewTracker(
    [
      ["Task", "Status", "Due date"],
      ["A", "Open", "3/4/2026"],
    ],
    { today }
  )
  assert.ok(review.unsure.some((line) => line.includes("month first")))
})

test("notes in a 'Latest update' column don't count as dates", () => {
  const review = reviewTracker(
    [
      ["Task", "Owner", "Status", "Due", "Latest update"],
      ["A", "Bo", "Open", "11/20/2026", "Waiting on vendor quote"],
      ["B", "Bo", "Open", "11/20/2026", "Sent draft to client"],
    ],
    { today }
  )
  assert.equal(review.columns.updated, undefined)
  assert.ok(review.unsure.some((line) => line.includes("mostly text")))
  assert.deepEqual(review.flagged, [])
})

test("missing columns become questions instead of guesses", () => {
  const review = reviewTracker(
    [
      ["Task", "Owner"],
      ["A", "Bo"],
    ],
    { today }
  )
  assert.equal(review.unsure.length, 3)
  assert.deepEqual(review.flagged, [])
  const blank = reviewTracker([["Budget"], [1200]], { today })
  assert.equal(blank.headerRow, undefined)
  assert.match(blank.unsure[0], /No header row/)
  assert.match(reviewTracker([], { today }).unsure[0], /empty/)
})

test("blocked comes from the status or a blocker column, not its negation", () => {
  const review = reviewTracker(
    [
      ["Task", "Status", "Blocked by", "Due date"],
      ["A", "Not blocked", "", ""],
      ["B", "Unblocked", "none", ""],
      ["C", "In progress", "Vendor contract", ""],
      ["D", "Waiting for review", "", ""],
      ["E", "Stuck", "", ""],
      ["F", "Incomplete", "", "10/1/2026"],
      ["G", "Won't do", "", "10/1/2026"],
    ],
    { today }
  )
  assert.deepEqual(
    review.flagged.map((row) => [row.task, row.reasons[0]]),
    [
      ["C", "blocker: Vendor contract"],
      ["D", 'status "Waiting for review"'],
      ["E", 'status "Stuck"'],
      ["F", "overdue by 31 days (due 2026-10-01)"],
    ]
  )
})

test("a person's column overrides win over header guesses", () => {
  const values = [
    ["Item", "Who", "State", "Target", "Promised", "Touched"],
    ["A", "Bo", "Open", serial("2026-12-01"), serial("2026-10-01"), serial(today)],
  ]
  const guessed = reviewTracker(values, { today })
  assert.equal(guessed.columns.due?.column, "D")
  assert.deepEqual(guessed.flagged, [])
  const told = reviewTracker(values, {
    today,
    columns: { due: "promised", updated: "F" },
  })
  assert.equal(told.columns.due?.header, "Promised")
  assert.equal(told.columns.updated?.column, "F")
  assert.deepEqual(told.flagged.map((row) => row.flags), [["overdue"]])
  const missing = reviewTracker(values, { today, columns: { owner: "Lead" } })
  assert.ok(missing.unsure.some((line) => line.includes('"Lead"')))
})

test("headers like 'Updated by' and 'Status date' land in the right roles", () => {
  const review = reviewTracker(
    [["Task", "Status", "Status date", "Updated by", "Due date"]],
    { today }
  )
  assert.equal(review.columns.status?.column, "B")
  assert.equal(review.columns.updated?.column, "C")
  assert.equal(review.columns.owner, undefined)
})

test("a range that starts mid-sheet keeps row and column numbers", () => {
  const review = reviewTracker(
    [
      ["Task", "Status", "Due"],
      ["Late", "Open", serial("2026-10-20")],
    ],
    { today, range: "'Q4 Plan'!C5:E40" }
  )
  assert.deepEqual(review.flagged[0].cells, {
    task: "'Q4 Plan'!C6",
    status: "'Q4 Plan'!D6",
    due: "'Q4 Plan'!E6",
  })
})

test("finding a task by name returns its row and cells", () => {
  const review = reviewTracker(pulseTrackerValues(today), {
    today,
    range: "Projects!A1:Z1000",
    find: ["homepage copy", "Nothing like this"],
  })
  assert.deepEqual(review.matches, [
    {
      query: "homepage copy",
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
    { query: "Nothing like this", rows: [] },
  ])
})

test("A1 helpers", () => {
  assert.deepEqual(rangeOrigin("Projects!A1:Z1000"), {
    sheet: "Projects",
    column: 0,
    row: 1,
  })
  assert.deepEqual(rangeOrigin("'Bob''s tasks'!$B$3:F9"), {
    sheet: "Bob's tasks",
    column: 1,
    row: 3,
  })
  assert.deepEqual(rangeOrigin(undefined), {
    sheet: undefined,
    column: 0,
    row: 1,
  })
  assert.equal(columnLetter(0), "A")
  assert.equal(columnLetter(25), "Z")
  assert.equal(columnLetter(26), "AA")
  assert.equal(quoteSheet("Projects"), "Projects")
  assert.equal(quoteSheet("Bob's tasks"), "'Bob''s tasks'")
  const id = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
  assert.equal(
    spreadsheetIdFrom(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`),
    id
  )
  assert.equal(spreadsheetIdFrom(id), id)
  assert.equal(
    spreadsheetIdFrom("https://docs.google.com/spreadsheets/d/e/2PACX-1vT/pubhtml"),
    undefined
  )
  assert.equal(spreadsheetIdFrom("My project tracker"), undefined)
})
