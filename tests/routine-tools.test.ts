import assert from "node:assert/strict"
import test from "node:test"

import { createRoutineTools, type RoutineStore } from "../lib/routine-tools"
import type { PublicRoutine } from "../lib/routines"

const options = { toolCallId: "call_1", messages: [], context: {} }

function routine(values: Partial<PublicRoutine> = {}): PublicRoutine {
  return {
    id: "r1",
    botId: "b1",
    chatId: "c1",
    title: "Morning brief",
    prompt: "Summarise my inbox",
    schedule: { kind: "daily", time: "08:00", days: [1, 2, 3, 4, 5] },
    timezone: "Europe/Paris",
    enabled: true,
    nextRunAt: new Date("2026-10-19T06:00:00Z"),
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
    createdAt: new Date(),
    description: "Weekdays at 8am",
    ...values,
  }
}

function store(overrides: Partial<RoutineStore> = {}): RoutineStore {
  return {
    timezone: async () => "Europe/Paris",
    list: async () => [routine()],
    create: async (input) =>
      routine({ title: input.title, timezone: input.timezone }),
    update: async (_id, patch) => routine(patch),
    remove: async () => {},
    ...overrides,
  }
}

test("scheduling uses the owner's saved timezone and the tool call as request ID", async () => {
  let created: unknown
  const tools = createRoutineTools(
    store({
      create: async (input) => {
        created = input
        return routine({ timezone: input.timezone })
      },
    })
  )
  const result = await tools.scheduleRoutine.execute!(
    {
      title: "Morning brief",
      prompt: "Summarise my inbox",
      schedule: { kind: "daily", time: "08:00", days: [1, 2, 3, 4, 5] },
    },
    options
  )
  assert.deepEqual(created, {
    title: "Morning brief",
    prompt: "Summarise my inbox",
    schedule: { kind: "daily", time: "08:00", days: [1, 2, 3, 4, 5] },
    timezone: "Europe/Paris",
    requestId: "call_1",
  })
  assert.equal(
    (result as { when: string }).when,
    "Weekdays at 8am (Europe/Paris)"
  )
})

test("plan limits come back as a message the bot can relay", async () => {
  const tools = createRoutineTools(
    store({
      create: async () => {
        throw new Error(
          "The free plan includes one routine. Upgrade to schedule more."
        )
      },
    })
  )
  const result = await tools.scheduleRoutine.execute!(
    {
      title: "Second",
      prompt: "Check the repo",
      schedule: { kind: "interval", hours: 4 },
      timezone: "UTC",
    },
    options
  )
  assert.deepEqual(result, {
    status: "failed",
    message: "The free plan includes one routine. Upgrade to schedule more.",
  })
})

test("pausing and listing", async () => {
  const tools = createRoutineTools(store())
  const paused = await tools.updateRoutine.execute!(
    { routineId: "r1", enabled: false },
    options
  )
  assert.equal((paused as { enabled: boolean }).enabled, false)
  const listed = await tools.listRoutines.execute!({}, options)
  assert.equal((listed as { routines: unknown[] }).routines.length, 1)
})

test("results carry the saved times as the owner reads them", async () => {
  const tools = createRoutineTools(
    store({
      timezone: async () => "America/Chicago",
      create: async (input) =>
        routine({
          timezone: input.timezone,
          nextRunAt: new Date("2026-10-19T13:00:00Z"),
          lastRunAt: new Date("2026-10-16T13:00:00Z"),
          lastStatus: "blocked",
          lastError: "Waiting for you in the chat.",
        }),
    })
  )
  const scheduled = (await tools.scheduleRoutine.execute!(
    {
      title: "Morning brief",
      prompt: "Summarise my inbox",
      schedule: { kind: "daily", time: "08:00", days: [1, 2, 3, 4, 5] },
    },
    options
  )) as Record<string, unknown>
  assert.equal(scheduled.status, "scheduled")
  assert.equal(scheduled.timezone, "America/Chicago")
  assert.equal(scheduled.nextRunLocal, "Mon Oct 19, 8:00 AM CDT")
  assert.equal(scheduled.lastRunLocal, "Fri Oct 16, 8:00 AM CDT")
  assert.equal(scheduled.lastStatus, "blocked")
  assert.equal(scheduled.lastError, "Waiting for you in the chat.")

  // A paused routine has no next run to confirm
  const listed = (await createRoutineTools(
    store({ list: async () => [routine({ enabled: false, nextRunAt: null })] })
  ).listRoutines.execute!({}, options)) as {
    routines: { nextRunLocal: string | null }[]
  }
  assert.equal(listed.routines[0].nextRunLocal, null)
})

test("a one-off may be a local wall-clock time, and one in the past is refused clearly", async () => {
  let created: unknown
  const now = () => new Date("2026-10-16T19:05:00Z")
  const tools = createRoutineTools(
    store({
      timezone: async () => "America/Chicago",
      create: async (input) => {
        created = input.schedule
        return routine()
      },
    }),
    { now }
  )
  const ok = (await tools.scheduleRoutine.execute!(
    {
      title: "Call mum",
      prompt: "Remind me to call mum",
      schedule: { kind: "once", at: "2026-10-17T15:00" },
    },
    options
  )) as { status: string }
  assert.equal(ok.status, "scheduled")
  assert.deepEqual(created, { kind: "once", at: "2026-10-17T15:00" })

  created = undefined
  // 14:00 local is before 14:05 local now
  const past = (await tools.scheduleRoutine.execute!(
    {
      title: "Call mum",
      prompt: "Remind me to call mum",
      schedule: { kind: "once", at: "2026-10-16T14:00" },
    },
    options
  )) as { status: string; message: string }
  assert.equal(past.status, "failed")
  assert.match(past.message, /already passed/)
  assert.match(past.message, /Fri Oct 16, 2:05 PM CDT/)
  assert.equal(created, undefined)

  // The store's own refusal reads the same way
  const refused = (await createRoutineTools(
    store({
      update: async () => {
        throw new Error("Pick a time in the future.")
      },
    })
  ).updateRoutine.execute!(
    { routineId: "r1", schedule: { kind: "once", at: "2020-01-01T09:00" } },
    options
  )) as { status: string; message: string }
  assert.match(refused.message, /already passed/)
})

test("an unattended turn's refusal reaches the bot as a message, and nothing is saved", async () => {
  const refusal =
    "Routines can only be changed while the owner is in the chat. Mention the change in your report instead."
  let saved = 0
  const guarded = () => {
    throw new Error(refusal)
  }
  const tools = createRoutineTools(
    store({
      create: async () => guarded(),
      update: async () => guarded(),
      remove: async () => guarded(),
      list: async () => {
        saved++
        return [routine()]
      },
    })
  )
  const results = await Promise.all([
    tools.scheduleRoutine.execute!(
      {
        title: "x",
        prompt: "y",
        schedule: { kind: "interval", hours: 1 },
      },
      options
    ),
    tools.updateRoutine.execute!({ routineId: "r1", enabled: false }, options),
    tools.deleteRoutine.execute!({ routineId: "r1" }, options),
  ])
  for (const result of results)
    assert.deepEqual(result, { status: "failed", message: refusal })
  // Listing is a read and still works
  assert.equal(
    ((await tools.listRoutines.execute!({}, options)) as { status: string })
      .status,
    "ok"
  )
  assert.equal(saved, 1)
})

test("tool descriptions steer scheduling into the tool", () => {
  const tools = createRoutineTools(store())
  assert.match(
    tools.scheduleRoutine.description as string,
    /do not just say you will/
  )
  assert.match(tools.scheduleRoutine.description as string, /listRoutines/)
  assert.match(
    tools.scheduleRoutine.description as string,
    /only after this returns/
  )
  assert.match(tools.listRoutines.description as string, /my morning briefing/)
  assert.match(tools.updateRoutine.description as string, /pause/)
})
