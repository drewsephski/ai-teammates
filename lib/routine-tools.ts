import { tool } from "ai"
import { z } from "zod"

import type { PublicRoutine } from "@/lib/routines"
import {
  formatLocalTime,
  resolveOnceInstant,
  routineScheduleSchema,
  timeZoneSchema,
} from "@/lib/routine-policy"

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

// What the bot may tell the owner. The *Local fields are the saved times as
// the owner reads them, so a confirmation never rests on the bot's own maths.
function summary(routine: PublicRoutine) {
  return {
    routineId: routine.id,
    title: routine.title,
    when: `${routine.description} (${routine.timezone})`,
    timezone: routine.timezone,
    enabled: routine.enabled,
    nextRunAt: routine.nextRunAt?.toISOString() ?? null,
    nextRunLocal: routine.nextRunAt
      ? formatLocalTime(routine.nextRunAt, routine.timezone)
      : null,
    lastRunLocal: routine.lastRunAt
      ? formatLocalTime(routine.lastRunAt, routine.timezone)
      : null,
    lastStatus: routine.lastStatus,
    lastError: routine.lastError,
  }
}

const PAST_TIME_MESSAGE =
  "That time has already passed. Work out the date from the clock in your instructions, or ask the owner when they mean."

// Failures go back to the model as text it can explain to the owner
async function attempt<T>(run: () => Promise<T>) {
  try {
    return await run()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "That didn't work. Try again."
    return {
      status: "failed" as const,
      message:
        message === "Pick a time in the future." ? PAST_TIME_MESSAGE : message,
    }
  }
}

const scheduleDescription =
  'When it runs, in the owner\'s timezone. {"kind":"daily","time":"08:00","days":[1,2,3,4,5]} is weekdays at 8am (0 is Sunday; list all seven for every day); {"kind":"interval","hours":4} is every four hours (whole hours, at least 1); {"kind":"once","at":"2026-10-20T09:00"} runs once at that local wall-clock time (no offset needed). Work dates out from the local time in your instructions.'

export function createRoutineTools(
  store: RoutineStore,
  options: { now?: () => Date } = {}
) {
  const now = options.now ?? (() => new Date())
  return {
    scheduleRoutine: tool({
      description:
        "Create a schedule: recurring or one-off work you'll do on your own in this chat, such as a morning inbox digest, an hourly check of a repo, or a reminder tomorrow afternoon. Call this whenever the owner asks for something 'every ...', 'each morning', 'later', 'tomorrow', 'remind me' or to keep an eye on something; do not just say you will. Each run you get the prompt as an unattended turn, work on your own and report back in this chat, and the owner is notified. Before creating, call listRoutines if the owner may already have a related routine, and update that one instead of making a duplicate. Ask a question only when the time or the task is genuinely missing; pick a sensible default for the rest and say what you picked. Tell the owner it is scheduled only after this returns status 'scheduled', and quote when (nextRunLocal) from the result, not from your own calculation.",
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
            "Complete, self-contained instructions for each run, written to your future self, who will not see this conversation: what to check, which apps or sources to use, what counts as worth reporting, what to do about it, and how to report (one line when there is nothing to report). Include any names, places or preferences from this chat that the run needs."
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
          if (input.schedule.kind === "once") {
            const at = resolveOnceInstant(input.schedule.at, zone)
            if (!at || at <= now())
              return {
                status: "failed" as const,
                message: `${PAST_TIME_MESSAGE} It is ${formatLocalTime(now(), zone)} now.`,
              }
          }
          const routine = await store.create({
            ...input,
            timezone: zone,
            requestId: toolCallId,
          })
          return { status: "scheduled" as const, ...summary(routine) }
        }),
    }),
    listRoutines: tool({
      description:
        "List the owner's routines with their routineId, schedule, when each runs next (nextRunLocal) and how the last run went (lastStatus: started, completed, blocked on a question or approval, failed, skipped; lastError says why). Use it to answer 'what routines do I have', to find the routine the owner means by 'my morning briefing' or 'that routine' before changing it, and to check for a related one before creating another.",
      inputSchema: z.object({}),
      execute: async () =>
        attempt(async () => ({
          status: "ok" as const,
          routines: (await store.list()).map(summary),
        })),
    }),
    updateRoutine: tool({
      description:
        "Change a routine by its routineId from listRoutines: its schedule ('make that weekdays'), its prompt, its title, or pause (enabled: false) and resume it (enabled: true). Send only the fields that change. Changing the schedule or resuming restarts the clock from now. Confirm only after it returns status 'updated', using nextRunLocal; a paused routine has none.",
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
      description:
        "Delete a routine for good, by its routineId from listRoutines. If the owner only wants it to stop for now, pause it with updateRoutine instead. Confirm which routine you deleted after it returns status 'deleted'.",
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
