import * as Sentry from "@sentry/node"
import { and, asc, count, desc, eq, lte } from "drizzle-orm"

import { db } from "@/db"
import {
  bots,
  chatMembers,
  chats,
  routineInsertSchema,
  routineUpdateSchema,
  routines,
  userSettings,
  type Routine,
  type RoutineInsert,
  type RoutineUpdate,
} from "@/db/schema"
import { canUseAI } from "@/lib/chatgpt-policy"
import { isChatGPTSelected } from "@/lib/chatgpt-connection"
import { postChatMessage } from "@/lib/chat-dispatch"
import { recordActivity } from "@/lib/notify"
import {
  assertRoutineCapacity,
  describeSchedule,
  nextRunAt,
  routineRunMessageId,
  routineRunPrompt,
} from "@/lib/routine-policy"
import { teamOperationId } from "@/lib/team-policy"
import { assertBotAccess } from "@/lib/teammates"
import { getAccountPlan, getUsage } from "@/lib/usage"

export type PublicRoutine = Omit<Routine, "userId"> & { description: string }

export function publicRoutine(row: Routine): PublicRoutine {
  const routine: Partial<Routine> = { ...row }
  delete routine.userId
  return {
    ...(routine as Omit<Routine, "userId">),
    description: describeSchedule(row.schedule, row.timezone),
  }
}

export async function listRoutines(userId: string, botId?: string) {
  const rows = await db
    .select()
    .from(routines)
    .where(
      and(
        eq(routines.userId, userId),
        botId ? eq(routines.botId, botId) : undefined
      )
    )
    .orderBy(desc(routines.createdAt))
  return rows.map(publicRoutine)
}

// `botId` narrows it further: a bot may only change its own routines
async function ownedRoutine(userId: string, routineId: string, botId?: string) {
  const [row] = await db
    .select()
    .from(routines)
    .where(
      and(
        eq(routines.id, routineId),
        eq(routines.userId, userId),
        botId ? eq(routines.botId, botId) : undefined
      )
    )
  if (!row) throw new Error("Routine not found")
  return row
}

export async function userTimeZone(userId: string) {
  const [row] = await db
    .select({ timezone: userSettings.timezone })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
  return row?.timezone || "UTC"
}

// The chat a routine reports to: the one asked for, if the bot is in it, or
// the bot's latest direct chat, or a new one.
async function routineChat(
  userId: string,
  botId: string,
  operationId: string,
  chatId?: string
) {
  if (chatId) {
    const [member] = await db
      .select({ chatId: chatMembers.chatId })
      .from(chatMembers)
      .innerJoin(chats, eq(chats.id, chatMembers.chatId))
      .where(
        and(
          eq(chatMembers.chatId, chatId),
          eq(chatMembers.botId, botId),
          eq(chats.userId, userId)
        )
      )
    if (!member) throw new Error("Chat not found")
    return chatId
  }
  const [latest] = await db
    .select({ id: chats.id })
    .from(chats)
    .innerJoin(chatMembers, eq(chatMembers.chatId, chats.id))
    .where(
      and(
        eq(chats.userId, userId),
        eq(chats.kind, "direct"),
        eq(chatMembers.botId, botId)
      )
    )
    .orderBy(desc(chats.lastMessageAt))
    .limit(1)
  if (latest) return latest.id
  const id = `chat_${operationId}`
  await db.transaction(async (tx) => {
    await tx
      .insert(chats)
      .values({ id, userId, kind: "direct" })
      .onConflictDoNothing()
    await tx
      .insert(chatMembers)
      .values({ chatId: id, botId })
      .onConflictDoNothing()
  })
  return id
}

// Idempotent on requestId, so a retried form or tool call returns the same row
export async function createRoutine(
  userId: string,
  input: RoutineInsert,
  options: { chatId?: string } = {}
) {
  const values = routineInsertSchema.parse(input)
  const id = teamOperationId(userId, "routine", values.requestId)
  const [existing] = await db
    .select()
    .from(routines)
    .where(and(eq(routines.id, id), eq(routines.userId, userId)))
  if (existing) return publicRoutine(existing)

  const [bot] = await db
    .select({ id: bots.id })
    .from(bots)
    .where(and(eq(bots.id, values.botId), eq(bots.userId, userId)))
  if (!bot) throw new Error("Bot not found")
  await assertBotAccess(userId, bot.id)
  const plan = await getAccountPlan(userId)
  const [{ total }] = await db
    .select({ total: count() })
    .from(routines)
    .where(eq(routines.userId, userId))
  assertRoutineCapacity(plan.tier, total)

  const chatId = await routineChat(userId, bot.id, id, options.chatId)
  const next = nextRunAt(values.schedule, values.timezone, new Date())
  if (!next) throw new Error("Pick a time in the future.")
  const [row] = await db
    .insert(routines)
    .values({
      id,
      userId,
      botId: bot.id,
      chatId,
      title: values.title,
      prompt: values.prompt,
      schedule: values.schedule,
      timezone: values.timezone,
      nextRunAt: next,
    })
    .onConflictDoNothing()
    .returning()
  return publicRoutine(row ?? (await ownedRoutine(userId, id)))
}

export async function updateRoutine(
  userId: string,
  routineId: string,
  input: RoutineUpdate,
  options: { botId?: string } = {}
) {
  const patch = routineUpdateSchema.parse(input)
  const current = await ownedRoutine(userId, routineId, options.botId)
  const merged = { ...current, ...patch }
  // Rescheduling or resuming starts the clock from now
  const reschedule =
    patch.schedule !== undefined ||
    patch.timezone !== undefined ||
    (patch.enabled === true && !current.enabled)
  const next = merged.enabled
    ? reschedule || !current.nextRunAt
      ? nextRunAt(merged.schedule, merged.timezone, new Date())
      : current.nextRunAt
    : null
  if (merged.enabled && !next) throw new Error("Pick a time in the future.")
  const [row] = await db
    .update(routines)
    .set({ ...patch, nextRunAt: next })
    .where(and(eq(routines.id, routineId), eq(routines.userId, userId)))
    .returning()
  if (!row) throw new Error("Routine not found")
  return publicRoutine(row)
}

export async function deleteRoutine(
  userId: string,
  routineId: string,
  options: { botId?: string } = {}
) {
  const [row] = await db
    .delete(routines)
    .where(
      and(
        eq(routines.id, routineId),
        eq(routines.userId, userId),
        options.botId ? eq(routines.botId, options.botId) : undefined
      )
    )
    .returning({ id: routines.id })
  if (!row) throw new Error("Routine not found")
}

// Posts one run into the routine's chat, after the checks a person's own
// message would pass. Returns what happened, and never throws for the owner's
// plan or allowance: those are recorded as a skipped run.
export async function runRoutine(routine: Routine, scheduledAt: Date) {
  const messageId = routineRunMessageId(routine.id, scheduledAt)
  const skip = async (reason: string) => {
    await db
      .update(routines)
      .set({ lastStatus: "skipped", lastError: reason, lastRunAt: new Date() })
      .where(eq(routines.id, routine.id))
    await recordActivity(
      {
        userId: routine.userId,
        kind: "routine_skipped",
        title: `${routine.title} didn't run`,
        detail: reason,
        botId: routine.botId,
        chatId: routine.chatId,
        dedupeKey: `${messageId}:skipped`,
      },
      {
        title: `${routine.title} didn't run`,
        body: reason,
        path: "/activity",
      }
    )
    return "skipped" as const
  }

  try {
    await assertBotAccess(routine.userId, routine.botId)
  } catch {
    // Plan-neutral: this reaches the phone, where upgrade copy isn't allowed
    return skip("This bot isn't available on your current plan.")
  }
  const usage = await getUsage(routine.userId)
  if (!canUseAI(usage.remaining.ai, await isChatGPTSelected(routine.userId)))
    return skip("Your AI allowance is used up until it resets.")

  try {
    await postChatMessage(
      routine.chatId,
      {
        id: messageId,
        text: routineRunPrompt(routine),
        displayPrompt: `Routine: ${routine.title}`,
      },
      { botId: routine.botId }
    )
  } catch (error) {
    Sentry.captureException(error, { extra: { routineId: routine.id } })
    await db
      .update(routines)
      .set({
        lastStatus: "failed",
        lastError: "Couldn't start the run.",
        lastRunAt: new Date(),
      })
      .where(eq(routines.id, routine.id))
    await recordActivity({
      userId: routine.userId,
      kind: "routine_failed",
      title: `${routine.title} couldn't start`,
      botId: routine.botId,
      chatId: routine.chatId,
      dedupeKey: `${messageId}:failed`,
    })
    return "failed" as const
  }
  await db
    .update(routines)
    .set({ lastStatus: "started", lastError: null, lastRunAt: new Date() })
    .where(eq(routines.id, routine.id))
  await recordActivity({
    userId: routine.userId,
    kind: "routine_started",
    title: `${routine.title} started`,
    botId: routine.botId,
    chatId: routine.chatId,
    dedupeKey: messageId,
  })
  return "started" as const
}

// "Run now" from the routine list. A double click inside ten seconds is one run.
export async function runRoutineNow(userId: string, routineId: string) {
  const routine = await ownedRoutine(userId, routineId)
  const result = await runRoutine(
    routine,
    new Date(Math.floor(Date.now() / 10_000) * 10_000)
  )
  return { status: result, chatId: routine.chatId }
}

// Claims due routines one at a time and advances each before it runs, so two
// cron runs never take the same one. Missed runs aren't replayed: the next
// time is computed from now.
export async function dispatchDueRoutines(now = new Date(), limit = 200) {
  const results = { started: 0, skipped: 0, failed: 0 }
  for (let index = 0; index < limit; index++) {
    const claimed = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(routines)
        .where(and(eq(routines.enabled, true), lte(routines.nextRunAt, now)))
        .orderBy(asc(routines.nextRunAt))
        .limit(1)
        .for("update", { skipLocked: true })
      if (!row) return undefined
      // From the time it was due, so "every hour" doesn't slip by the cron's
      // latency each run; skip over any runs missed while workers were down
      let next = nextRunAt(row.schedule, row.timezone, row.nextRunAt ?? now)
      while (next && next <= now)
        next = nextRunAt(row.schedule, row.timezone, next)
      await tx
        .update(routines)
        .set({ nextRunAt: next, enabled: next !== null, lastRunAt: now })
        .where(eq(routines.id, row.id))
      return row
    })
    if (!claimed) break
    try {
      results[await runRoutine(claimed, claimed.nextRunAt ?? now)]++
    } catch (error) {
      results.failed++
      Sentry.captureException(error, { extra: { routineId: claimed.id } })
    }
  }
  return results
}
