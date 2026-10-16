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
