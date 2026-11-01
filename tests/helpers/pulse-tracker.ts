// A realistic, slightly messy project tracker for Krafty Pulse checks: a title
// row and a blank row above the header, a blank row inside the data, finished
// and cancelled work that is past due, a "TBD" date, and flagged rows deep in
// the sheet. Dates are relative to `today` so the expected flags never drift.
// Used by tests/tracker-review.test.ts and scripts/verify-pulse-agent.ts.

export type PulseExpectation = {
  row: number
  overdue?: boolean
  blocked?: boolean
  stale?: boolean
}

type Row = {
  task: string
  owner: string
  status: string
  due: number | "TBD"
  updated: number
}

// Day offsets from today: negative is in the past
const tasks: Row[] = [
  { task: "Finalize sitemap", owner: "Priya", status: "Done", due: -10, updated: -9 },
  { task: "Homepage copy", owner: "Marcus", status: "In progress", due: -3, updated: -2 },
  { task: "Brand photography", owner: "Lena", status: "Blocked", due: 5, updated: -1 },
  { task: "CMS migration", owner: "Tom", status: "In progress", due: 10, updated: -8 },
  { task: "Legal review of terms", owner: "Priya", status: "Waiting on legal", due: 2, updated: -3 },
  { task: "Analytics setup", owner: "Marcus", status: "Not started", due: 14, updated: -6 },
  { task: "Accessibility audit", owner: "Lena", status: "In progress", due: 0, updated: -1 },
]
const afterGap: Row[] = [
  { task: "Redirect map", owner: "Tom", status: "In progress", due: -1, updated: -1 },
  { task: "QA pass", owner: "Sam", status: "Not started", due: 20, updated: -2 },
  { task: "Launch email", owner: "Priya", status: "Draft", due: 7, updated: -4 },
  { task: "Press kit", owner: "Lena", status: "Complete", due: -20, updated: -15 },
  { task: "Pricing page", owner: "Marcus", status: "On hold", due: -2, updated: -12 },
  { task: "Image compression", owner: "Sam", status: "In progress", due: 3, updated: -4 },
  { task: "Domain DNS cutover", owner: "Tom", status: "Scheduled", due: "TBD", updated: -1 },
]
const fillerNames = [
  "Footer links",
  "404 page",
  "Cookie banner",
  "Blog index",
  "Author pages",
  "Search results page",
  "Newsletter form",
  "Careers page",
  "Case study template",
  "Team page",
  "Contact form",
  "Partner logos",
  "Social cards",
  "Favicon set",
  "Pricing FAQ",
  "Status page link",
  "Changelog page",
  "Video embeds",
  "Form spam filter",
  "Sitemap.xml",
  "Robots rules",
]
const filler: Row[] = fillerNames.map((task, index) => ({
  task,
  owner: ["Sam", "Lena", "Tom", "Priya"][index % 4],
  status: "In progress",
  due: 3 + (index % 9),
  updated: -1 - (index % 3),
}))
// Data rows start at row 4, the blank row is 11, the rows after it start at 12
// and the filler at 19. Rows 33 and 41 are flagged deep in the sheet, and row
// 42 is cancelled.
filler.splice(33 - 19, 0, {
  task: "Localization strings",
  owner: "Sam",
  status: "In progress",
  due: -6,
  updated: -2,
})
const tail: Row[] = [
  { task: "Old browser support", owner: "Tom", status: "In progress", due: 9, updated: -11 },
  { task: "Print stylesheet", owner: "Lena", status: "Cancelled", due: -4, updated: -30 },
]

export const pulseTrackerHeader = [
  "#",
  "Task",
  "Owner",
  "Status",
  "Due date",
  "Last update",
  "Notes",
]

export const pulseExpectations: PulseExpectation[] = [
  { row: 5, overdue: true },
  { row: 6, blocked: true },
  { row: 7, stale: true },
  { row: 8, blocked: true },
  { row: 9, stale: true },
  { row: 12, overdue: true },
  { row: 16, overdue: true, blocked: true, stale: true },
  { row: 33, overdue: true },
  { row: 41, stale: true },
]

// Sheets' default FORMATTED_VALUE rendering for a US-locale sheet: M/D/YYYY
export function usDate(today: string, offset: number) {
  const date = new Date(`${today}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`
}

/** The tracker's values from A1, as GOOGLESHEETS_BATCH_GET returns them. */
export function pulseTrackerValues(today: string) {
  let number = 0
  const row = (entry: Row) => [
    String(++number),
    entry.task,
    entry.owner,
    entry.status,
    entry.due === "TBD" ? "TBD" : usDate(today, entry.due),
    usDate(today, entry.updated),
    "",
  ]
  return [
    ["Website relaunch – project tracker"],
    [],
    pulseTrackerHeader,
    ...tasks.map(row),
    [],
    ...afterGap.map(row),
    ...filler.map(row),
    ...tail.map(row),
  ]
}
