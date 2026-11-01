// Krafty Pulse's tracker review: which rows of a project tracker are overdue,
// blocked or stale, with the sheet's own row numbers and cell addresses. The
// model reads these instead of counting rows and doing date math itself, which
// it gets wrong after a blank row or a title above the header
// (scripts/verify-pulse-agent.ts). Pure; tested in tests/tracker-review.test.ts.

export const trackerRoles = [
  "task",
  "owner",
  "status",
  "due",
  "updated",
  "blocker",
] as const
export type TrackerRole = (typeof trackerRoles)[number]

// A column the person named, by its header text or its letter
export type TrackerColumns = Partial<Record<TrackerRole, string>>

export const DEFAULT_STALE_DAYS = 5
// Rows past this are not reviewed; the result says so
export const MAX_TRACKER_ROWS = 5_000
const MAX_FLAGGED = 60
const MAX_LISTED = 20
const HEADER_SCAN_ROWS = 20

// Header words for each column, best first
const synonyms: Record<TrackerRole, string[]> = {
  task: [
    "task",
    "task name",
    "tasks",
    "item",
    "work item",
    "action item",
    "deliverable",
    "milestone",
    "activity",
    "title",
    "name",
    "action",
    "to do",
    "todo",
    "story",
    "issue",
    "description",
    "summary",
  ],
  owner: [
    "owner",
    "assignee",
    "assigned to",
    "assigned",
    "responsible",
    "dri",
    "lead",
    "who",
    "person",
    "point of contact",
    "poc",
    "resource",
    "accountable",
  ],
  status: ["status", "state", "progress", "stage"],
  due: [
    "due date",
    "due",
    "deadline",
    "due by",
    "date due",
    "target date",
    "target",
    "end date",
    "finish date",
    "eta",
    "end",
  ],
  updated: [
    "last update",
    "last updated",
    "latest update",
    "updated",
    "updated on",
    "date updated",
    "last modified",
    "modified",
    "last touched",
    "last activity",
    "last check in",
    "last status update",
    "status date",
    "last edited",
    "as of",
    "update date",
    "update",
  ],
  blocker: [
    "blocker",
    "blockers",
    "blocked",
    "blocked by",
    "impediment",
    "impediments",
  ],
}

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

// How well a header names a role: exact beats a phrase inside a longer header.
// A person or a reason ("Updated by", "Due date notes") is not a date.
function headerScore(role: TrackerRole, header: string) {
  const h = words(header)
  if (!h) return 0
  if (
    (role === "due" || role === "updated") &&
    /\b(by|who|owner|notes?|comments?|reason)\b/.test(h)
  )
    return 0
  if (role === "status" && /\b(date|updated|by)\b/.test(h)) return 0
  const list = synonyms[role]
  for (let index = 0; index < list.length; index++) {
    if (h === list[index]) return 200 - index
  }
  for (let index = 0; index < list.length; index++) {
    if (` ${h} `.includes(` ${list[index]} `)) return 100 - index
  }
  return 0
}

export function columnLetter(index: number) {
  let letter = ""
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter
  return letter
}

function columnIndex(letters: string) {
  return (
    [...letters.toUpperCase()].reduce(
      (sum, char) => sum * 26 + char.charCodeAt(0) - 64,
      0
    ) - 1
  )
}

/** Sheet name and top-left cell of an A1 range such as `'My Sheet'!B3:F40`. */
export function rangeOrigin(range: string | undefined) {
  const match =
    /^(?:(?:'((?:[^']|'')+)'|([^!]+))!)?\$?([A-Za-z]{1,3})?\$?(\d+)?/.exec(
      range ?? ""
    )
  return {
    sheet: match?.[1]?.replace(/''/g, "'") ?? match?.[2] ?? undefined,
    column: match?.[3] ? columnIndex(match[3]) : 0,
    row: match?.[4] ? Number(match[4]) : 1,
  }
}

/** A sheet name as A1 notation needs it: quoted unless it's plain. */
export function quoteSheet(name: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
    ? name
    : `'${name.replace(/'/g, "''")}'`
}

/** The spreadsheet ID in a Google Sheets link, or the ID itself. */
export function spreadsheetIdFrom(input: string) {
  const text = input.trim()
  if (/\/spreadsheets\/d\/e\//.test(text)) return undefined
  const fromUrl = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(text)
  if (fromUrl) return fromUrl[1]
  return /^[A-Za-z0-9_-]{20,}$/.test(text) ? text : undefined
}

// Dates

type ParsedDate = { iso: string; ambiguous?: boolean; yearAssumed?: boolean }

const months = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
]

function isoOf(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return undefined
  return date.toISOString().slice(0, 10)
}

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) /
      86_400_000
  )
}

function monthNumber(name: string) {
  const index = months.indexOf(name.slice(0, 3).toLowerCase())
  return index < 0 ? undefined : index + 1
}

// A written date with no year: the year that puts it nearest today
function nearestYear(month: number, day: number, today: string) {
  const year = Number(today.slice(0, 4))
  const candidates = [year - 1, year, year + 1]
    .map((y) => isoOf(y, month, day))
    .filter((iso): iso is string => !!iso)
  return candidates.sort(
    (a, b) => Math.abs(daysBetween(today, a)) - Math.abs(daysBetween(today, b))
  )[0]
}

const numeric = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[ T].*)?$/

/**
 * A date cell as ISO. Real date cells arrive as serial numbers (days since
 * 1899-12-30) when read unformatted; text dates are parsed, with `order`
 * deciding 3/4/2026 when nothing in the column does.
 */
export function parseTrackerDate(
  value: unknown,
  today: string,
  order: "mdy" | "dmy" = "mdy"
): ParsedDate | undefined {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 20_000 || value > 80_000)
      return undefined
    const date = new Date(
      Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000
    )
    return { iso: date.toISOString().slice(0, 10) }
  }
  if (typeof value !== "string") return undefined
  const text = value.trim().replace(/\s+/g, " ")
  if (!text) return undefined
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/.exec(text)
  if (match) {
    const iso = isoOf(Number(match[1]), Number(match[2]), Number(match[3]))
    return iso ? { iso } : undefined
  }
  match = numeric.exec(text)
  if (match) {
    const a = Number(match[1])
    const b = Number(match[2])
    const year =
      match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])
    const dayFirst = a > 12 || (b <= 12 && order === "dmy")
    const iso = dayFirst ? isoOf(year, b, a) : isoOf(year, a, b)
    return iso ? { iso, ambiguous: a <= 12 && b <= 12 && a !== b } : undefined
  }
  // "Nov 3", "Tue, Nov 3 2026", "November 3rd, 2026"
  match =
    /^(?:[a-z]{3,9}\.?,? )?([a-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/i.exec(
      text
    )
  // "3 Nov 2026", "3rd November"
  const dayFirst =
    /^(?:[a-z]{3,9}\.?,? )?(\d{1,2})(?:st|nd|rd|th)? ([a-z]{3,9})\.?,?(?: (\d{4}))?$/i.exec(
      text
    )
  const parts = match
    ? { month: match[1], day: match[2], year: match[3] }
    : dayFirst
      ? { month: dayFirst[2], day: dayFirst[1], year: dayFirst[3] }
      : undefined
  if (!parts) return undefined
  const month = monthNumber(parts.month)
  if (!month) return undefined
  if (parts.year) {
    const iso = isoOf(Number(parts.year), month, Number(parts.day))
    return iso ? { iso } : undefined
  }
  const iso = nearestYear(month, Number(parts.day), today)
  return iso ? { iso, yearAssumed: true } : undefined
}

// Whether a column's text dates are day-first, from any date that settles it
function dateOrder(values: unknown[]): "mdy" | "dmy" | undefined {
  let order: "mdy" | "dmy" | undefined
  for (const value of values) {
    if (typeof value !== "string") continue
    const match = numeric.exec(value.trim())
    if (!match) continue
    if (Number(match[1]) > 12) return "dmy"
    if (Number(match[2]) > 12) order = "mdy"
  }
  return order
}

// Status

const DONE =
  /^(?:done|complete|completed|closed|shipped|finished|delivered|resolved|launched|live|cancell?ed|dropped|abandoned|won'?t do|not doing|archived|n\/a|100 ?%|✅|✔)(?![a-z])/i
const BLOCKED =
  /\b(?:blocked|blocker|on hold|hold|stuck|waiting|awaiting|paused|escalated|halted|stalled|needs (?:help|input|decision|approval|review))\b/i
const NOT_BLOCKED = /\b(?:not|no longer|un)[ -]?blocked\b|\bno blockers?\b/i
const EMPTY_BLOCKER =
  /^(?:no|none|nope|n\/a|na|-+|—|false|0|nothing|no blockers?)$/i

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim()

function isDone(status: string) {
  return DONE.test(status.trim())
}

function isBlockedStatus(status: string) {
  return BLOCKED.test(status) && !NOT_BLOCKED.test(status)
}

function blockerText(value: unknown) {
  if (value === true) return "checked"
  if (value === false) return ""
  const content = text(value)
  return content && !EMPTY_BLOCKER.test(content) ? content : ""
}

const short = (value: string, size = 120) =>
  value.length > size ? `${value.slice(0, size - 1)}…` : value

export type FlaggedRow = {
  row: number
  task: string
  owner?: string
  status?: string
  due?: string
  lastUpdate?: string
  flags: ("overdue" | "blocked" | "stale")[]
  reasons: string[]
  // A1 addresses of the row's cells, for an exact write
  cells: Partial<Record<TrackerRole, string>>
}

export type TrackerMatch = {
  query: string
  rows: {
    row: number
    task: string
    // What the row holds now, so a change can be read back
    values: Partial<Record<TrackerRole, string>>
    cells: Partial<Record<TrackerRole, string>>
  }[]
}

export type TrackerReview = {
  sheet?: string
  today: string
  staleDays: number
  headerRow?: number
  columns: Partial<Record<TrackerRole, { column: string; header: string }>>
  // Questions for the person before relying on the result
  unsure: string[]
  rowsChecked: number
  firstDataRow?: number
  lastDataRow?: number
  counts: {
    overdue: number
    blocked: number
    stale: number
    done: number
    flagged: number
  }
  flagged: FlaggedRow[]
  flaggedOmitted?: number
  dueToday: { row: number; task: string }[]
  noDueDate: number[]
  unreadableDates: { cell: string; value: string }[]
  matches?: TrackerMatch[]
  rowLimitReached?: boolean
}

function findHeader(values: unknown[][]) {
  let best: { index: number; roles: number } | undefined
  for (
    let index = 0;
    index < Math.min(values.length, HEADER_SCAN_ROWS);
    index++
  ) {
    const cells = values[index] ?? []
    const roles = trackerRoles.filter((role) =>
      cells.some(
        (cell) => typeof cell === "string" && headerScore(role, cell) > 0
      )
    ).length
    if (roles >= 2 && (!best || roles > best.roles)) best = { index, roles }
  }
  return best?.index
}

type Assignment = Partial<Record<TrackerRole, number>>

// Never choose between plausible columns on the person's behalf.
function assignColumns(header: unknown[]) {
  const assignment: Assignment = {}
  const ambiguous = new Set<TrackerRole>()
  for (const role of trackerRoles) {
    const candidates = header.flatMap((cell, index) =>
      typeof cell === "string" && headerScore(role, cell) > 0 ? [index] : []
    )
    if (candidates.length === 1) assignment[role] = candidates[0]
    else if (candidates.length > 1) ambiguous.add(role)
  }
  return { assignment, ambiguous }
}

function applyOverrides(
  overrides: TrackerColumns,
  header: unknown[],
  startColumn: number,
  assignment: Assignment,
  ambiguous: Set<TrackerRole>,
  unsure: string[]
) {
  for (const role of trackerRoles) {
    const wanted = overrides[role]?.trim()
    if (!wanted) continue
    // An invalid saved override must not fall back to a fresh guess.
    delete assignment[role]
    const matches = header.flatMap((cell, index) =>
      typeof cell === "string" && words(cell) === words(wanted) ? [index] : []
    )
    if (matches.length === 1) {
      assignment[role] = matches[0]
      ambiguous.delete(role)
      continue
    }
    if (!matches.length && /^[A-Za-z]{1,3}$/.test(wanted)) {
      const index = columnIndex(wanted) - startColumn
      if (
        index >= 0 &&
        index < header.length &&
        headerScore(role, text(header[index])) > 0
      ) {
        assignment[role] = index
        ambiguous.delete(role)
        continue
      }
    }
    unsure.push(
      `Column "${wanted}" for ${role} is missing, ambiguous, or no longer fits its header. Columns may have moved; ask the person to confirm the current header or letter.`
    )
  }
  for (const role of ambiguous)
    unsure.push(
      `Several columns could hold ${role}. Ask which current header or letter to use.`
    )
  for (const role of trackerRoles) {
    const index = assignment[role]
    if (
      index !== undefined &&
      trackerRoles.some(
        (other) => other !== role && assignment[other] === index
      )
    )
      unsure.push(
        `Column ${columnLetter(startColumn + index)} was assigned to several roles. Ask for separate columns.`
      )
  }
}

// A date column whose cells are mostly notes is not a date column
function mostlyDates(
  rows: unknown[][],
  index: number,
  today: string,
  order: "mdy" | "dmy"
) {
  const filled = rows
    .map((row) => row[index])
    .filter((value) => text(value) !== "")
  if (!filled.length) return true
  const dates = filled.filter((value) => parseTrackerDate(value, today, order))
  return dates.length * 2 >= filled.length
}

export function reviewTracker(
  values: unknown[][],
  options: {
    today: string
    range?: string
    staleDays?: number
    columns?: TrackerColumns
    find?: string[]
  }
): TrackerReview {
  const { today } = options
  const staleDays = options.staleDays ?? DEFAULT_STALE_DAYS
  const origin = rangeOrigin(options.range)
  const unsure: string[] = []
  const rowLimitReached = values.length > MAX_TRACKER_ROWS
  const grid = values.slice(0, MAX_TRACKER_ROWS)
  const empty: TrackerReview = {
    sheet: origin.sheet,
    today,
    staleDays,
    columns: {},
    unsure,
    rowsChecked: 0,
    counts: { overdue: 0, blocked: 0, stale: 0, done: 0, flagged: 0 },
    flagged: [],
    dueToday: [],
    noDueDate: [],
    unreadableDates: [],
  }
  const headerIndex = findHeader(grid)
  if (headerIndex === undefined) {
    unsure.push(
      grid.length
        ? "No header row naming the task, owner, status or dates was found in the first 20 rows. Ask which columns hold them, then pass them as columns."
        : "This sheet is empty. Ask whether the tracker is on another tab."
    )
    return empty
  }
  const header = grid[headerIndex] ?? []
  const { assignment, ambiguous } = assignColumns(header)
  applyOverrides(
    options.columns ?? {},
    header,
    origin.column,
    assignment,
    ambiguous,
    unsure
  )
  // No row identities, writable addresses or conclusions until confirmed.
  if (unsure.length) return { ...empty, headerRow: origin.row + headerIndex }

  const rowNumber = (index: number) => origin.row + index
  const letter = (index: number) => columnLetter(origin.column + index)
  // Full addresses, so a write names the sheet as well as the cell
  const prefix = origin.sheet ? `${quoteSheet(origin.sheet)}!` : ""
  const data = grid.slice(headerIndex + 1)
  const orders: Partial<Record<TrackerRole, "mdy" | "dmy">> = {}
  for (const role of ["due", "updated"] as const) {
    const index = assignment[role]
    if (index === undefined) continue
    const column = data.map((row) => row[index])
    const found = dateOrder(column)
    orders[role] = found ?? "mdy"
    if (!mostlyDates(data, index, today, orders[role])) {
      unsure.push(
        `Column ${letter(index)} ("${text(header[index])}") holds mostly text, not dates, so ${role === "due" ? "overdue tasks" : "stale tasks"} can't be judged from it. Ask which column has the ${role === "due" ? "due date" : "date of the last update"}.`
      )
      delete assignment[role]
      continue
    }
    if (
      !found &&
      column.some((value) => parseTrackerDate(value, today)?.ambiguous)
    )
      unsure.push(
        `Dates in column ${letter(index)} ("${text(header[index])}") are written like 3/4/2026, which could be March 4 or 3 April. They were read month first; ask if that's wrong.`
      )
  }
  const columns: TrackerReview["columns"] = {}
  for (const role of trackerRoles) {
    const index = assignment[role]
    if (index !== undefined)
      columns[role] = { column: letter(index), header: text(header[index]) }
  }
  if (assignment.task === undefined)
    unsure.push("No task column was found. Ask which column names each task.")
  if (assignment.status === undefined && assignment.blocker === undefined)
    unsure.push(
      "No status column was found, so blocked and finished tasks can't be told apart. Ask which column holds the status."
    )
  if (
    assignment.due === undefined &&
    !unsure.some((u) => u.includes("overdue"))
  )
    unsure.push(
      "No due date column was found, so overdue tasks can't be judged. Ask which column holds due dates."
    )
  if (
    assignment.updated === undefined &&
    !unsure.some((u) => u.includes("stale"))
  )
    unsure.push(
      `No last-update column was found, so tasks that haven't been updated in ${staleDays} days can't be judged. Ask which column records the last update, or skip that check.`
    )

  const cell = (role: TrackerRole, index: number) =>
    assignment[role] === undefined
      ? undefined
      : `${prefix}${letter(assignment[role]!)}${rowNumber(index)}`
  const at = (row: unknown[], role: TrackerRole) =>
    assignment[role] === undefined ? undefined : row[assignment[role]!]

  const review: TrackerReview = {
    ...empty,
    headerRow: rowNumber(headerIndex),
    columns,
    rowLimitReached: rowLimitReached || undefined,
  }
  const flagged: FlaggedRow[] = []
  data.forEach((row, offset) => {
    const index = headerIndex + 1 + offset
    const mapped = trackerRoles.map((role) => text(at(row, role)))
    if (mapped.every((value) => !value)) return
    review.rowsChecked++
    review.firstDataRow ??= rowNumber(index)
    review.lastDataRow = rowNumber(index)
    const task = text(at(row, "task")) || "(no task name)"
    const status = text(at(row, "status"))
    if (isDone(status)) {
      review.counts.done++
      return
    }
    const flags: FlaggedRow["flags"] = []
    const reasons: string[] = []
    const dueValue = at(row, "due")
    const due =
      assignment.due === undefined
        ? undefined
        : parseTrackerDate(dueValue, today, orders.due)
    if (assignment.due !== undefined) {
      if (due) {
        const late = daysBetween(due.iso, today)
        if (late > 0) {
          flags.push("overdue")
          reasons.push(
            `overdue by ${late} day${late === 1 ? "" : "s"} (due ${due.iso})`
          )
        } else if (late === 0)
          review.dueToday.push({ row: rowNumber(index), task: short(task) })
      } else if (text(dueValue)) {
        review.unreadableDates.push({
          cell: cell("due", index)!,
          value: short(text(dueValue), 40),
        })
        review.noDueDate.push(rowNumber(index))
      } else review.noDueDate.push(rowNumber(index))
    }
    const blocker = blockerText(at(row, "blocker"))
    if (isBlockedStatus(status) || blocker) {
      flags.push("blocked")
      reasons.push(
        blocker
          ? `blocker: ${short(blocker, 80)}`
          : `status "${short(status, 60)}"`
      )
    }
    const updatedValue = at(row, "updated")
    const updated =
      assignment.updated === undefined
        ? undefined
        : parseTrackerDate(updatedValue, today, orders.updated)
    if (updated) {
      const quiet = daysBetween(updated.iso, today)
      if (quiet >= staleDays) {
        flags.push("stale")
        reasons.push(`no update for ${quiet} days (last ${updated.iso})`)
      }
    } else if (assignment.updated !== undefined && text(updatedValue))
      review.unreadableDates.push({
        cell: cell("updated", index)!,
        value: short(text(updatedValue), 40),
      })
    for (const flag of flags) review.counts[flag]++
    if (!flags.length) return
    flagged.push({
      row: rowNumber(index),
      task: short(task),
      ...(text(at(row, "owner")) && {
        owner: short(text(at(row, "owner")), 60),
      }),
      ...(status && { status: short(status, 60) }),
      ...(due && { due: due.iso }),
      ...(updated && { lastUpdate: updated.iso }),
      flags,
      reasons,
      cells: Object.fromEntries(
        trackerRoles
          .map((role) => [role, cell(role, index)] as const)
          .filter(([, address]) => address)
      ),
    })
  })
  review.counts.flagged = flagged.length
  review.flagged = flagged.slice(0, MAX_FLAGGED)
  if (flagged.length > MAX_FLAGGED)
    review.flaggedOmitted = flagged.length - MAX_FLAGGED
  review.dueToday = review.dueToday.slice(0, MAX_LISTED)
  review.noDueDate = review.noDueDate.slice(0, MAX_LISTED)
  review.unreadableDates = review.unreadableDates.slice(0, MAX_LISTED)

  if (options.find?.length && assignment.task !== undefined) {
    review.matches = options.find.slice(0, 10).map((query) => {
      const needle = words(query)
      const rows = data
        .map((row, offset) => ({ row, index: headerIndex + 1 + offset }))
        .filter(({ row }) => {
          const name = words(text(at(row, "task")))
          return (
            !!needle && !!name && (name === needle || name.includes(needle))
          )
        })
        .slice(0, 5)
        .map(({ row, index }) => ({
          row: rowNumber(index),
          task: short(text(at(row, "task"))),
          values: Object.fromEntries(
            trackerRoles
              .filter((role) => assignment[role] !== undefined)
              .map((role) => {
                const value = at(row, role)
                const date =
                  role === "due" || role === "updated"
                    ? parseTrackerDate(value, today, orders[role])
                    : undefined
                return [role, date ? date.iso : short(text(value), 80)]
              })
          ),
          cells: Object.fromEntries(
            trackerRoles
              .map((role) => [role, cell(role, index)] as const)
              .filter(([, address]) => address)
          ),
        }))
      return { query, rows }
    })
  }
  return review
}
