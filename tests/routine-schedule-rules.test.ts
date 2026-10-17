import assert from "node:assert/strict"
import test from "node:test"

import {
  describeSchedule,
  formatLocalTime,
  MISSED_RUN_ERROR,
  missedRunGraceMs,
  nextRunAt,
  normalizeSchedule,
  parseRoutineRunMessageId,
  planDueRun,
  resolveOnceInstant,
  routineClock,
  routineOutcomeError,
  routineRunMessageId,
  routineScheduleSchema,
} from "../lib/routine-policy"

const daily = (time: string, days = [0, 1, 2, 3, 4, 5, 6]) =>
  routineScheduleSchema.parse({ kind: "daily", time, days })
const iso = (date: Date | null) => date?.toISOString()

test("a one-off accepts a wall-clock time and reads it in the routine's zone", () => {
  const local = routineScheduleSchema.parse({
    kind: "once",
    at: "2026-10-17T15:00",
  })
  // 15:00 EDT is 19:00 UTC; the same wall clock after the clocks fall back is EST
  assert.equal(
    iso(nextRunAt(local, "America/New_York", new Date("2026-10-16T00:00:00Z"))),
    "2026-10-17T19:00:00.000Z"
  )
  assert.equal(
    iso(resolveOnceInstant("2026-11-01T15:00:00", "America/New_York")),
    "2026-11-01T20:00:00.000Z"
  )
  assert.equal(
    iso(resolveOnceInstant("2026-10-17T15:00", "Europe/London")),
    "2026-10-17T14:00:00.000Z"
  )
  assert.equal(
    iso(resolveOnceInstant("2026-10-17T15:00", "Asia/Tokyo")),
    "2026-10-17T06:00:00.000Z"
  )
})

test("the offset form old clients send keeps its meaning in any zone", () => {
  for (const zone of ["UTC", "America/New_York", "Asia/Tokyo"]) {
    assert.equal(
      iso(resolveOnceInstant("2026-10-20T09:00:00-04:00", zone)),
      "2026-10-20T13:00:00.000Z"
    )
    assert.equal(
      iso(resolveOnceInstant("2026-10-20T09:00:00Z", zone)),
      "2026-10-20T09:00:00.000Z"
    )
  }
  const offset = routineScheduleSchema.parse({
    kind: "once",
    at: "2026-10-20T09:00:00-04:00",
  })
  assert.equal(normalizeSchedule(offset, "UTC").kind, "once")
  assert.equal(
    (normalizeSchedule(offset, "Asia/Tokyo") as { at: string }).at,
    "2026-10-20T13:00:00.000Z"
  )
})

test("normalising turns a wall-clock one-off into the stored instant and leaves other schedules alone", () => {
  const stored = normalizeSchedule(
    { kind: "once", at: "2026-10-17T15:00" },
    "America/Chicago"
  )
  assert.deepEqual(stored, { kind: "once", at: "2026-10-17T20:00:00.000Z" })
  const weekdays = daily("08:00", [1, 2, 3, 4, 5])
  assert.equal(normalizeSchedule(weekdays, "UTC"), weekdays)
  // Once stored, the zone no longer matters
  assert.equal(
    iso(nextRunAt(stored, "Asia/Tokyo", new Date("2026-10-16T00:00:00Z"))),
    "2026-10-17T20:00:00.000Z"
  )
})

test("a one-off that reads as a wall-clock time is described in its zone", () => {
  assert.equal(
    describeSchedule(
      { kind: "once", at: "2026-10-17T15:00" },
      "America/New_York"
    ),
    "Once, Oct 17, 3:00 PM"
  )
})

test("garbage dates are refused with a second-person message", () => {
  for (const at of ["next tuesday", "2026-10-17 15:00", "tomorrow at 3"])
    assert.throws(
      () => routineScheduleSchema.parse({ kind: "once", at }),
      /Pick a date and time/
    )
})

test("the clock line tells the model the owner's local time", () => {
  const now = new Date("2026-10-16T19:05:00Z")
  assert.equal(
    routineClock("America/Chicago", now),
    "Owner's timezone: America/Chicago. Local time now: Fri 2026-10-16 14:05 CDT."
  )
  // Past midnight locally while still the same UTC day
  assert.match(
    routineClock("Asia/Tokyo", new Date("2026-10-16T16:30:00Z")),
    /Local time now: Sat 2026-10-17 01:30/
  )
  assert.match(
    routineClock("UTC", now, { assumed: true }),
    /timezone is not set.*Ask where they are/
  )
})

test("times are formatted the way the owner reads them", () => {
  assert.equal(
    formatLocalTime(new Date("2026-10-19T13:00:00Z"), "America/Chicago"),
    "Mon Oct 19, 8:00 AM CDT"
  )
  assert.equal(
    formatLocalTime(new Date("2026-12-01T00:05:00Z"), "America/Chicago"),
    "Mon Nov 30, 6:05 PM CST"
  )
  assert.equal(
    formatLocalTime(new Date("2026-10-16T00:00:00Z"), "UTC"),
    "Fri Oct 16, 12:00 AM UTC"
  )
})

test("one-off, daily, weekday and interval schedules pick the right next time", () => {
  const friday = new Date("2026-10-16T20:00:00Z")
  assert.equal(
    iso(nextRunAt({ kind: "once", at: "2026-10-17T09:00:00Z" }, "UTC", friday)),
    "2026-10-17T09:00:00.000Z"
  )
  assert.equal(
    iso(nextRunAt(daily("07:00"), "America/New_York", friday)),
    "2026-10-17T11:00:00.000Z"
  )
  // Friday evening: the next weekday run is Monday
  assert.equal(
    iso(nextRunAt(daily("07:00", [1, 2, 3, 4, 5]), "America/New_York", friday)),
    "2026-10-19T11:00:00.000Z"
  )
  assert.equal(
    iso(nextRunAt({ kind: "interval", hours: 6 }, "UTC", friday)),
    "2026-10-17T02:00:00.000Z"
  )
})

test("daily routines hold their wall-clock time across New York's changes", () => {
  const at8 = daily("08:00")
  // Spring forward, Sunday 8 March 2026: 08:00 EST is 13:00Z, then EDT is 12:00Z
  assert.equal(
    iso(nextRunAt(at8, "America/New_York", new Date("2026-03-07T14:00:00Z"))),
    "2026-03-08T12:00:00.000Z"
  )
  // A 02:30 routine has no 02:30 that day: it runs just after the gap
  assert.equal(
    iso(
      nextRunAt(
        daily("02:30"),
        "America/New_York",
        new Date("2026-03-08T00:00:00Z")
      )
    ),
    "2026-03-08T07:30:00.000Z"
  )
  // Fall back, Sunday 1 November: 01:30 happens twice and runs once, first time
  assert.equal(
    iso(
      nextRunAt(
        daily("01:30"),
        "America/New_York",
        new Date("2026-11-01T00:00:00Z")
      )
    ),
    "2026-11-01T05:30:00.000Z"
  )
  assert.equal(
    iso(
      nextRunAt(
        daily("01:30"),
        "America/New_York",
        new Date("2026-11-01T05:30:00Z")
      )
    ),
    "2026-11-02T06:30:00.000Z"
  )
})

test("daily routines hold their wall-clock time across London's changes", () => {
  const at8 = daily("08:00")
  // BST starts Sunday 29 March 2026: 08:00 GMT is 08:00Z, then BST is 07:00Z
  assert.equal(
    iso(nextRunAt(at8, "Europe/London", new Date("2026-03-28T09:00:00Z"))),
    "2026-03-29T07:00:00.000Z"
  )
  // 01:30 does not exist on 29 March: just after the gap, 02:30 BST
  assert.equal(
    iso(
      nextRunAt(
        daily("01:30"),
        "Europe/London",
        new Date("2026-03-29T00:00:00Z")
      )
    ),
    "2026-03-29T01:30:00.000Z"
  )
  // BST ends Sunday 25 October: 08:00 BST is 07:00Z before, 08:00Z after
  assert.equal(
    iso(nextRunAt(at8, "Europe/London", new Date("2026-10-24T08:00:00Z"))),
    "2026-10-25T08:00:00.000Z"
  )
  assert.equal(
    iso(nextRunAt(at8, "Europe/London", new Date("2026-10-23T08:00:00Z"))),
    "2026-10-24T07:00:00.000Z"
  )
  // 01:30 on 25 October happens twice and runs at the first
  assert.equal(
    iso(
      nextRunAt(
        daily("01:30"),
        "Europe/London",
        new Date("2026-10-25T00:00:00Z")
      )
    ),
    "2026-10-25T00:30:00.000Z"
  )
})

test("interval routines count real hours, not wall-clock hours, across a change", () => {
  const every24 = { kind: "interval" as const, hours: 24 }
  assert.equal(
    iso(
      nextRunAt(every24, "America/New_York", new Date("2026-10-31T12:00:00Z"))
    ),
    "2026-11-01T12:00:00.000Z"
  )
})

test("run message IDs round-trip and refuse anything else", () => {
  const at = new Date("2026-10-16T14:00:00.000Z")
  const id = routineRunMessageId("a1b2c3d4e5f6", at)
  assert.deepEqual(parseRoutineRunMessageId(id), {
    routineId: "a1b2c3d4e5f6",
    scheduledAt: at,
  })
  // IDs with underscores still split on the last one
  assert.equal(
    parseRoutineRunMessageId(routineRunMessageId("rt_1", at))?.routineId,
    "rt_1"
  )
  for (const bad of [
    undefined,
    "",
    "approval_x_1",
    "routine_x",
    "routine__1760000000000a",
    "brief_op",
  ])
    assert.equal(parseRoutineRunMessageId(bad), undefined)
})

test("outcomes read back as a short truthful note", () => {
  assert.equal(routineOutcomeError({ status: "completed" }), null)
  assert.equal(
    routineOutcomeError({ status: "blocked" }),
    "Waiting for you in the chat."
  )
  assert.equal(
    routineOutcomeError({ status: "failed" }),
    "The run didn't finish."
  )
  assert.equal(
    routineOutcomeError({ status: "blocked", detail: "  Needs\n your   OK  " }),
    "Needs your OK"
  )
  assert.equal(
    routineOutcomeError({ status: "failed", detail: "x".repeat(900) })?.length,
    300
  )
})

test("a late run goes ahead inside its grace window and is missed outside it", () => {
  const dueAt = new Date("2026-10-16T12:00:00Z")
  const hourly = {
    schedule: { kind: "interval" as const, hours: 1 },
    timezone: "UTC",
  }
  const morning = { schedule: daily("08:00"), timezone: "UTC" }
  const reminder = {
    schedule: { kind: "once" as const, at: dueAt.toISOString() },
    timezone: "UTC",
  }
  const after = (ms: number) => new Date(dueAt.getTime() + ms)
  const minute = 60_000

  // The cron's own latency is always fine
  assert.equal(planDueRun(hourly, dueAt, after(45_000)).action, "run")
  assert.equal(planDueRun(hourly, dueAt, after(30 * minute)).action, "run")
  assert.equal(planDueRun(hourly, dueAt, after(31 * minute)).action, "missed")
  assert.equal(planDueRun(morning, dueAt, after(60 * minute)).action, "run")
  assert.equal(planDueRun(morning, dueAt, after(61 * minute)).action, "missed")
  assert.equal(
    planDueRun(reminder, dueAt, after(5 * 60 * minute)).action,
    "run"
  )
  assert.equal(
    planDueRun(reminder, dueAt, after(7 * 60 * minute)).action,
    "missed"
  )
  assert.equal(missedRunGraceMs({ kind: "interval", hours: 8 }), 60 * minute)
  assert.match(MISSED_RUN_ERROR, /^Missed while Krafty was unavailable$/)
})

test("after downtime the next run is the first one in the future, counted from when it was due", () => {
  const dueAt = new Date("2026-10-16T12:00:00Z")
  const now = new Date("2026-10-16T15:20:00Z")
  const every2 = {
    schedule: { kind: "interval" as const, hours: 2 },
    timezone: "UTC",
  }
  const plan = planDueRun(every2, dueAt, now)
  assert.equal(plan.action, "missed")
  // 14:00 was missed too and is not replayed; the cadence keeps its phase
  assert.equal(iso(plan.next), "2026-10-16T16:00:00.000Z")

  const morning = { schedule: daily("08:00"), timezone: "America/New_York" }
  const monday = new Date("2026-10-19T12:00:00Z")
  const planned = planDueRun(morning, monday, new Date("2026-10-21T09:00:00Z"))
  assert.equal(planned.action, "missed")
  assert.equal(iso(planned.next), "2026-10-21T12:00:00.000Z")

  // A one-off that was missed has nothing left to schedule
  const once = {
    schedule: { kind: "once" as const, at: dueAt.toISOString() },
    timezone: "UTC",
  }
  assert.equal(
    planDueRun(once, dueAt, new Date("2026-10-17T12:00:00Z")).next,
    null
  )
})
