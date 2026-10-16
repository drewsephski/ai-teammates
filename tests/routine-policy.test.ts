import assert from "node:assert/strict"
import test from "node:test"

import {
  assertRoutineCapacity,
  describeSchedule,
  nextRunAt,
  routineRunMessageId,
  routineScheduleSchema,
  unattendedOrigin,
  zonedTime,
} from "../lib/routine-policy"

const daily = (time: string, days = [0, 1, 2, 3, 4, 5, 6]) =>
  routineScheduleSchema.parse({ kind: "daily", time, days })

test("a daily routine runs at the next matching wall-clock time in its zone", () => {
  // 2026-10-16 is a Friday. 13:00 UTC is 09:00 in New York (EDT).
  const after = new Date("2026-10-16T13:30:00Z")
  assert.equal(
    nextRunAt(daily("09:00"), "America/New_York", after)?.toISOString(),
    "2026-10-17T13:00:00.000Z"
  )
  assert.equal(
    nextRunAt(daily("10:00"), "America/New_York", after)?.toISOString(),
    "2026-10-16T14:00:00.000Z"
  )
})

test("weekday routines skip the weekend", () => {
  const friday = new Date("2026-10-16T20:00:00Z")
  assert.equal(
    nextRunAt(
      daily("08:00", [1, 2, 3, 4, 5]),
      "Europe/London",
      friday
    )?.toISOString(),
    // Monday 19 Oct, 08:00 BST
    "2026-10-19T07:00:00.000Z"
  )
})

test("clock times follow daylight saving changes", () => {
  // New York leaves DST on 2026-11-01: 08:00 is 12:00 UTC before, 13:00 after
  const before = nextRunAt(
    daily("08:00"),
    "America/New_York",
    new Date("2026-10-31T13:00:00Z")
  )
  const afterChange = nextRunAt(
    daily("08:00"),
    "America/New_York",
    new Date("2026-11-01T12:30:00Z")
  )
  assert.equal(before?.toISOString(), "2026-11-01T13:00:00.000Z")
  assert.equal(afterChange?.toISOString(), "2026-11-01T13:00:00.000Z")
  // A time skipped by spring-forward lands just after the gap (03:30 EDT),
  // and a repeated one takes its first occurrence (01:30 EDT)
  assert.equal(
    zonedTime(
      { year: 2026, month: 3, day: 8 },
      2,
      30,
      "America/New_York"
    ).toISOString(),
    "2026-03-08T07:30:00.000Z"
  )
  assert.equal(
    zonedTime(
      { year: 2026, month: 11, day: 1 },
      1,
      30,
      "America/New_York"
    ).toISOString(),
    "2026-11-01T05:30:00.000Z"
  )
})

test("interval and one-off schedules", () => {
  const now = new Date("2026-10-16T10:00:00Z")
  assert.equal(
    nextRunAt({ kind: "interval", hours: 3 }, "UTC", now)?.toISOString(),
    "2026-10-16T13:00:00.000Z"
  )
  const once = { kind: "once" as const, at: "2026-10-17T09:00:00Z" }
  assert.equal(
    nextRunAt(once, "UTC", now)?.toISOString(),
    "2026-10-17T09:00:00.000Z"
  )
  assert.equal(nextRunAt(once, "UTC", new Date("2026-10-18T00:00:00Z")), null)
})

test("schedules are validated with second-person messages", () => {
  assert.throws(
    () => routineScheduleSchema.parse({ kind: "interval", hours: 0 }),
    /at most once an hour/
  )
  assert.throws(
    () =>
      routineScheduleSchema.parse({ kind: "daily", time: "25:00", days: [1] }),
    /Pick a time/
  )
  assert.deepEqual(
    (
      routineScheduleSchema.parse({
        kind: "daily",
        time: "08:00",
        days: [5, 1, 1],
      }) as { days: number[] }
    ).days,
    [1, 5]
  )
})

test("schedules read naturally", () => {
  assert.equal(
    describeSchedule(daily("08:00", [1, 2, 3, 4, 5]), "UTC"),
    "Weekdays at 8am"
  )
  assert.equal(describeSchedule(daily("17:30"), "UTC"), "Every day at 5:30pm")
  assert.equal(
    describeSchedule(daily("09:00", [1, 3]), "UTC"),
    "Mon, Wed at 9am"
  )
  assert.equal(
    describeSchedule({ kind: "interval", hours: 1 }, "UTC"),
    "Every hour"
  )
  assert.equal(
    describeSchedule({ kind: "interval", hours: 48 }, "UTC"),
    "Every 2 days"
  )
})

test("plan limits and unattended turn origins", () => {
  assert.doesNotThrow(() => assertRoutineCapacity("free", 0))
  assert.throws(
    () => assertRoutineCapacity("free", 1),
    /free plan includes one routine/
  )
  assert.doesNotThrow(() => assertRoutineCapacity("paid", 49))
  assert.throws(() => assertRoutineCapacity("paid", 50))
  const id = routineRunMessageId("r1", new Date(0))
  assert.equal(unattendedOrigin(id), "routine")
  assert.equal(unattendedOrigin("brief_x"), "delegation")
  assert.equal(unattendedOrigin("approval_x_approve"), "approval")
  assert.equal(unattendedOrigin("task_x"), "task")
  assert.equal(unattendedOrigin("msg-123"), undefined)
})
