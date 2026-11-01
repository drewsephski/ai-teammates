// The morning summary: one push, at the person's digestHour in their
// timezone, with what their bots did since the last one. Pure; the sending
// lives in lib/morning-summary.ts and the hourly task in
// trigger/morning-summary.ts.

// A summary covers at most the last day, and goes out at most once a day
export const SUMMARY_WINDOW_MS = 24 * 3_600_000
export const SUMMARY_MIN_GAP_MS = 20 * 3_600_000

export type SummaryEventKind =
  | "routine_started"
  | "routine_skipped"
  | "routine_failed"
  | "approval_requested"
  | "approval_decided"
  | "question_asked"
  | "work_finished"
  | "work_failed"

// The hour of the day it is in `timeZone`, 0–23. Undefined for a timezone
// this runtime doesn't know.
export function localHour(now: Date, timeZone: string) {
  try {
    const hour = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now)
    return Number(hour)
  } catch {
    return undefined
  }
}

// Whether the person is due a summary now. "UTC" is the column's default, so
// it means they never chose a timezone and their morning is unknown.
export function summaryDue(
  settings: {
    morningSummary: boolean
    timezone: string
    digestHour: number
    lastSummaryAt: Date | null
  },
  now: Date
) {
  if (!settings.morningSummary || settings.timezone === "UTC") return false
  if (localHour(now, settings.timezone) !== settings.digestHour) return false
  return (
    !settings.lastSummaryAt ||
    now.getTime() - settings.lastSummaryAt.getTime() >= SUMMARY_MIN_GAP_MS
  )
}

// Where the summary's events start: the last summary, or a day ago
export function summaryWindowStart(lastSummaryAt: Date | null, now: Date) {
  const dayAgo = new Date(now.getTime() - SUMMARY_WINDOW_MS)
  return lastSummaryAt && lastSummaryAt > dayAgo ? lastSummaryAt : dayAgo
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`

// The push, or null when nothing happened worth a notification. Approvals
// count what's still waiting now, not what was asked.
export function morningSummary(
  events: readonly { kind: SummaryEventKind }[],
  pendingApprovals: number
) {
  let finished = 0
  let unfinished = 0
  let questions = 0
  let asked = 0
  for (const event of events) {
    if (event.kind === "work_finished") finished++
    else if (
      event.kind === "work_failed" ||
      event.kind === "routine_failed" ||
      event.kind === "routine_skipped"
    )
      unfinished++
    else if (event.kind === "question_asked") questions++
    else if (event.kind === "approval_requested") asked++
  }
  if (!finished && !unfinished && !questions && !asked) return null

  const parts = [
    finished && plural(finished, "task finished", "tasks finished"),
    pendingApprovals &&
      plural(pendingApprovals, "approval waiting", "approvals waiting"),
    questions && plural(questions, "question for you", "questions for you"),
    unfinished &&
      plural(unfinished, "task didn't finish", "tasks didn't finish"),
  ].filter(Boolean)
  // Approvals asked overnight and already decided leave nothing to report
  if (!parts.length) return null
  return {
    title: "While you were away",
    body: parts.join(" · "),
    path: "/activity",
  }
}
