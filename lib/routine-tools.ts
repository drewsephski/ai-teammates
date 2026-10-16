import { tool } from "ai"
import { z } from "zod"

import type { PublicRoutine } from "@/lib/routines"
import { routineScheduleSchema, timeZoneSchema } from "@/lib/routine-policy"

type RoutineFields = {
  title?: string
  prompt?: string
  schedule?: z.infer<typeof routineScheduleSchema>
  timezone?: string
  enabled?: boolean
}

// Injected so tests run without a database (lib/routines.ts in production)
export type RoutineStore = {
  timezone: () => Promise<string>
  list: () => Promise<PublicRoutine[]>
  create: (input: {
    title: string
    prompt: string
    schedule: z.infer<typeof routineScheduleSchema>
    timezone: string
    requestId: string
  }) => Promise<PublicRoutine>
  update: (routineId: string, patch: RoutineFields) => Promise<PublicRoutine>
  remove: (routineId: string) => Promise<void>
}

function summary(routine: PublicRoutine) {
  return {
    routineId: routine.id,
    title: routine.title,
    when: `${routine.description} (${routine.timezone})`,
    enabled: routine.enabled,
    nextRunAt: routine.nextRunAt?.toISOString() ?? null,
    lastStatus: routine.lastStatus,
  }
}

// Failures go back to the model as text it can explain to the owner
async function attempt<T>(run: () => Promise<T>) {
  try {
    return await run()
  } catch (error) {
    return {
      status: "failed" as const,
      message:
        error instanceof Error ? error.message : "That didn't work. Try again.",
    }
  }
}

const scheduleDescription =
  'When it runs. {"kind":"daily","time":"08:00","days":[1,2,3,4,5]} is weekdays at 8am (0 is Sunday); {"kind":"interval","hours":4} is every four hours (at least 1); {"kind":"once","at":"2026-10-20T09:00:00-04:00"} runs once.'

export function createRoutineTools(store: RoutineStore) {
  return {
    scheduleRoutine: tool({
      description:
        "Schedule recurring or one-off work you'll do on your own in this chat, such as a morning inbox digest or an hourly check of a repo. Each run, you get the prompt as an unattended turn and report back here; the owner is notified. Use it when the owner asks for something on a schedule or to keep an eye on something.",
      inputSchema: z.object({
        title: z
          .string()
          .trim()
          .min(1)
          .max(60)
          .describe("Short name, e.g. 'Morning brief'"),
        prompt: z
          .string()
          .trim()
          .min(1)
          .max(2000)
          .describe(
            "Complete instructions for each run, written to your future self: what to check, what counts as worth reporting, and what to do about it."
          ),
        schedule: routineScheduleSchema.describe(scheduleDescription),
        timezone: timeZoneSchema
          .optional()
          .describe(
            "IANA zone such as America/New_York. Leave out to use the owner's saved timezone."
          ),
      }),
      execute: async ({ timezone, ...input }, { toolCallId }) =>
        attempt(async () => {
          const zone = timezone ?? (await store.timezone())
          const routine = await store.create({
            ...input,
            timezone: zone,
            requestId: toolCallId,
          })
          return { status: "scheduled" as const, ...summary(routine) }
        }),
    }),
    listRoutines: tool({
      description: "List the owner's routines, with when each runs next.",
      inputSchema: z.object({}),
      execute: async () =>
        attempt(async () => ({
          status: "ok" as const,
          routines: (await store.list()).map(summary),
        })),
    }),
    updateRoutine: tool({
      description:
        "Change, pause (enabled: false) or resume a routine by its routineId from listRoutines.",
      inputSchema: z.object({
        routineId: z.string().min(1).max(100),
        title: z.string().trim().min(1).max(60).optional(),
        prompt: z.string().trim().min(1).max(2000).optional(),
        schedule: routineScheduleSchema
          .optional()
          .describe(scheduleDescription),
        timezone: timeZoneSchema.optional(),
        enabled: z.boolean().optional(),
      }),
      execute: async ({ routineId, ...patch }) =>
        attempt(async () => ({
          status: "updated" as const,
          ...summary(await store.update(routineId, patch)),
        })),
    }),
    deleteRoutine: tool({
      description: "Delete a routine for good, by its routineId.",
      inputSchema: z.object({ routineId: z.string().min(1).max(100) }),
      execute: async ({ routineId }) =>
        attempt(async () => {
          await store.remove(routineId)
          return { status: "deleted" as const, routineId }
        }),
    }),
  }
}

export type RoutineTools = ReturnType<typeof createRoutineTools>
