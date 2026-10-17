import { z } from "zod"

// Browser-safe: the routine form and db/schema.ts import this module.

export const ROUTINE_LIMITS = { free: 1, paid: 50 } as const
export const MIN_INTERVAL_HOURS = 1
export const ROUTINE_LIMIT_ERROR =
  "The free plan includes one routine. Upgrade to schedule more."
export const PAID_ROUTINE_LIMIT_ERROR = `You can have up to ${ROUTINE_LIMITS.paid} routines.`

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time like 08:30.")

export const routineScheduleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("daily"),
    time,
    // 0 is Sunday. Every day when all seven are listed.
    days: z
      .array(z.number().int().min(0).max(6))
      .min(1, "Pick at least one day.")
      .max(7)
      .transform((days) => [...new Set(days)].sort()),
  }),
  z.object({
    kind: z.literal("interval"),
    hours: z
      .number()
      .int("Use whole hours.")
      .min(MIN_INTERVAL_HOURS, "Run it at most once an hour.")
      .max(24 * 7, "Run it at least once a week."),
  }),
  z.object({
    kind: z.literal("once"),
    // An instant with an offset ("2026-10-20T09:00:00-04:00" or "...Z"), or a
    // wall-clock time without one ("2026-10-20T09:00") that is read in the
    // routine's timezone. Stored routines are normalised to the instant.
    at: z.iso.datetime({
      offset: true,
      local: true,
      message: "Pick a date and time.",
    }),
  }),
])
export type RoutineSchedule = z.infer<typeof routineScheduleSchema>

export function isTimeZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone })
    return true
  } catch {
    return false
  }
}

export const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(isTimeZone, "Pick a timezone from the list.")

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(zone: string) {
  let format = formatters.get(zone)
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    })
    formatters.set(zone, format)
  }
  return format
}

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

// The wall clock in a zone at an instant
export function zonedParts(instant: Date, zone: string) {
  const parts = Object.fromEntries(
    formatter(zone)
      .formatToParts(instant)
      .map((part) => [part.type, part.value])
  )
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: weekdays.indexOf(parts.weekday),
  }
}

function offsetAt(instant: number, zone: string) {
  const p = zonedParts(new Date(instant), zone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(instant / 1000) * 1000
}

// The instant a wall-clock time happens in a zone. A time skipped by a DST
// change lands just after the gap; a repeated one takes its first occurrence.
export function zonedTime(
  date: { year: number; month: number; day: number },
  hour: number,
  minute: number,
  zone: string
) {
  const wall = Date.UTC(date.year, date.month - 1, date.day, hour, minute)
  const candidates = [
    ...new Set([
      wall - offsetAt(wall, zone),
      wall - offsetAt(wall - offsetAt(wall, zone), zone),
      // The offsets either side of a change, so both readings are tried
      wall - offsetAt(wall - 12 * 3_600_000, zone),
      wall - offsetAt(wall + 12 * 3_600_000, zone),
    ]),
  ].sort((a, b) => a - b)
  const exact = candidates.filter((instant) => {
    const parts = zonedParts(new Date(instant), zone)
    return (
      parts.year === date.year &&
      parts.month === date.month &&
      parts.day === date.day &&
      parts.hour === hour &&
      parts.minute === minute
    )
  })
  // No exact reading means the time was skipped: take the later one
  return new Date(exact.length ? exact[0] : candidates[candidates.length - 1])
}

const LOCAL_DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/

// The instant a one-off routine runs. An offset is taken as written; a
// wall-clock time is read in the routine's zone. Null when unreadable.
export function resolveOnceInstant(at: string, zone: string) {
  const local = LOCAL_DATETIME.exec(at)
  if (!local) {
    const instant = new Date(at)
    return Number.isNaN(instant.getTime()) ? null : instant
  }
  const [year, month, day, hour, minute, second] = local.slice(1).map(Number)
  const start = zonedTime({ year, month, day }, hour, minute, zone)
  return new Date(start.getTime() + (second || 0) * 1000)
}

// The same schedule with a one-off's wall-clock time turned into an instant,
// which is what gets stored. Other schedules come back unchanged.
export function normalizeSchedule(
  schedule: RoutineSchedule,
  zone: string
): RoutineSchedule {
  if (schedule.kind !== "once") return schedule
  const instant = resolveOnceInstant(schedule.at, zone)
  return instant ? { kind: "once", at: instant.toISOString() } : schedule
}

// When a routine runs next, strictly after `after`. Null when it never will.
export function nextRunAt(
  schedule: RoutineSchedule,
  zone: string,
  after: Date
): Date | null {
  switch (schedule.kind) {
    case "once": {
      const at = resolveOnceInstant(schedule.at, zone)
      return at && at > after ? at : null
    }
    case "interval":
      return new Date(after.getTime() + schedule.hours * 3_600_000)
    case "daily": {
      const [hour, minute] = schedule.time.split(":").map(Number)
      const today = zonedParts(after, zone)
      for (let offset = 0; offset <= 8; offset++) {
        // Noon UTC never crosses a date line when stepping whole days
        const day = new Date(
          Date.UTC(today.year, today.month - 1, today.day + offset, 12)
        )
        const date = {
          year: day.getUTCFullYear(),
          month: day.getUTCMonth() + 1,
          day: day.getUTCDate(),
        }
        if (!schedule.days.includes(day.getUTCDay())) continue
        const at = zonedTime(date, hour, minute, zone)
        if (at > after) return at
      }
      return null
    }
  }
}

function clock(time: string) {
  const [hour, minute] = time.split(":").map(Number)
  const suffix = hour < 12 ? "am" : "pm"
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return minute
    ? `${twelve}:${String(minute).padStart(2, "0")}${suffix}`
    : `${twelve}${suffix}`
}

// "Weekdays at 8am", "Every 3 hours", in the routine's own zone
export function describeSchedule(schedule: RoutineSchedule, zone: string) {
  switch (schedule.kind) {
    case "interval":
      return schedule.hours === 1
        ? "Every hour"
        : schedule.hours % 24 === 0
          ? schedule.hours === 24
            ? "Every 24 hours"
            : `Every ${schedule.hours / 24} days`
          : `Every ${schedule.hours} hours`
    case "once": {
      const at = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(resolveOnceInstant(schedule.at, zone) ?? new Date(NaN))
      return `Once, ${at}`
    }
    case "daily": {
      const days = schedule.days.join(",")
      const label =
        days === "0,1,2,3,4,5,6"
          ? "Every day"
          : days === "1,2,3,4,5"
            ? "Weekdays"
            : days === "0,6"
              ? "Weekends"
              : schedule.days.map((day) => weekdays[day]).join(", ")
      return `${label} at ${clock(schedule.time)}`
    }
  }
}

const zoneNames = new Map<string, Intl.DateTimeFormat>()
function zoneAbbreviation(instant: Date, zone: string) {
  let format = zoneNames.get(zone)
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "short",
    })
    zoneNames.set(zone, format)
  }
  return format.formatToParts(instant).find((p) => p.type === "timeZoneName")
    ?.value
}

const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

// "Mon Oct 19, 8:00 AM CDT": an instant as the owner reads it. The tools
// return this so the bot confirms times that were really saved.
export function formatLocalTime(instant: Date, zone: string) {
  const p = zonedParts(instant, zone)
  const hour = p.hour % 12 === 0 ? 12 : p.hour % 12
  const minute = String(p.minute).padStart(2, "0")
  const period = p.hour < 12 ? "AM" : "PM"
  const name = zoneAbbreviation(instant, zone)
  return `${weekdays[p.weekday]} ${months[p.month - 1]} ${p.day}, ${hour}:${minute} ${period}${name ? ` ${name}` : ""}`
}

// The line that tells the model when "now" is for the owner. It only knows
// the UTC date otherwise, so "tomorrow afternoon" would drift.
export function routineClock(
  timezone: string,
  now: Date,
  options: { assumed?: boolean } = {}
) {
  const p = zonedParts(now, timezone)
  const pad = (value: number, size = 2) => String(value).padStart(size, "0")
  const local = `${weekdays[p.weekday]} ${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`
  const name = zoneAbbreviation(now, timezone)
  return options.assumed
    ? `Owner's timezone is not set, so UTC is assumed. Ask where they are before scheduling by clock time. UTC time now: ${local}.`
    : `Owner's timezone: ${timezone}. Local time now: ${local}${name ? ` ${name}` : ""}.`
}

export function assertRoutineCapacity(tier: "free" | "paid", count: number) {
  if (count >= ROUTINE_LIMITS[tier])
    throw new Error(
      tier === "free" ? ROUTINE_LIMIT_ERROR : PAID_ROUTINE_LIMIT_ERROR
    )
}

// The message a scheduled run posts. Its ID marks the turn as unattended.
export function routineRunMessageId(routineId: string, scheduledAt: Date) {
  return `routine_${routineId}_${scheduledAt.getTime()}`
}

// Reads a run's message ID back into its routine and the time it was due.
// Routine IDs are hex, but the last segment is what is trusted.
export function parseRoutineRunMessageId(messageId: string | undefined) {
  const match = /^routine_(.+)_(\d{10,16})$/.exec(messageId ?? "")
  if (!match) return undefined
  const scheduledAt = new Date(Number(match[2]))
  if (Number.isNaN(scheduledAt.getTime())) return undefined
  return { routineId: match[1], scheduledAt }
}

// How a finished run is recorded on its routine
export type RoutineRunOutcome = {
  status: "completed" | "blocked" | "failed"
  detail?: string
}

export function routineOutcomeError(outcome: RoutineRunOutcome) {
  if (outcome.status === "completed") return null
  const detail = outcome.detail?.replace(/\s+/g, " ").trim().slice(0, 300)
  if (detail) return detail
  return outcome.status === "blocked"
    ? "Waiting for you in the chat."
    : "The run didn't finish."
}

export const MISSED_RUN_ERROR = "Missed while Krafty was unavailable"

// How late a run may start and still be worth doing. A morning brief at nine
// is no use at noon, an hourly check an hour late is the next one anyway, and
// a one-off reminder is better late than never.
export function missedRunGraceMs(schedule: RoutineSchedule) {
  switch (schedule.kind) {
    case "once":
      return 6 * 3_600_000
    case "daily":
      return 3_600_000
    case "interval":
      return Math.min(3_600_000, schedule.hours * 1_800_000)
  }
}

// What to do with a routine found due. A run inside its grace window goes
// ahead; a staler one is recorded as missed. Either way the next run is the
// first one after `now`, counted from the time it was due so intervals don't
// drift, and the runs in between are never replayed.
export function planDueRun(
  routine: { schedule: RoutineSchedule; timezone: string },
  dueAt: Date,
  now: Date
) {
  let next = nextRunAt(routine.schedule, routine.timezone, dueAt)
  while (next && next <= now)
    next = nextRunAt(routine.schedule, routine.timezone, next)
  return {
    action:
      now.getTime() - dueAt.getTime() <= missedRunGraceMs(routine.schedule)
        ? ("run" as const)
        : ("missed" as const),
    next,
  }
}

export function routineRunPrompt(routine: { title: string; prompt: string }) {
  return [
    `Scheduled routine "${routine.title}". Nobody is watching this chat right now, so work on your own and finish with a short report of what you did and found.`,
    `If you need the owner (a decision, a sign-in, or missing information), ask with askUser; they get a notification. External actions that need approval wait for the owner automatically.`,
    "",
    routine.prompt,
  ].join("\n")
}

// Turns nobody started from the composer, by the ID their server-sent message carries
export function unattendedOrigin(messageId: string | undefined) {
  if (!messageId) return undefined
  if (messageId.startsWith("routine_")) return "routine" as const
  if (messageId.startsWith("brief_")) return "delegation" as const
  if (messageId.startsWith("approval_")) return "approval" as const
  if (messageId.startsWith("task_")) return "task" as const
  return undefined
}
