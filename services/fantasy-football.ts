import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import {
  bots,
  fantasyFootballSettings,
  fantasyFootballSettingsSchema,
  routines,
} from "@/db/schema"
import { readFantasySettings } from "@/lib/fantasy-football-store"
import {
  canonicalEspnTeamUrl,
  fantasyRoutinePrompt,
  type FantasyMode,
} from "@/lib/fantasy-football-policy"
import { createRoutine, updateRoutine } from "@/lib/routines"
import { withSandboxLock } from "@/lib/sandbox-lock"

async function ownedBot(userId: string, botId: string) {
  const [bot] = await db
    .select({ id: bots.id })
    .from(bots)
    .where(and(eq(bots.id, botId), eq(bots.userId, userId)))
  if (!bot) throw new Error("Bot not found")
}

export async function initializeFantasySettings(
  userId: string,
  botId: string,
  mode: FantasyMode
) {
  await ownedBot(userId, botId)
  await db
    .insert(fantasyFootballSettings)
    .values({ userId, botId, mode })
    .onConflictDoNothing()
}

export async function getFantasySettings(userId: string, botId: string) {
  await ownedBot(userId, botId)
  const row = await readFantasySettings(userId, botId)
  if (!row) return null
  const settings = {
    botId: row.botId,
    mode: row.mode,
    teamUrl: row.teamUrl,
    timezone: row.timezone,
    checkTime: row.checkTime,
    enabled: row.enabled,
    routineId: row.routineId,
    updatedAt: row.updatedAt,
  }
  const [routine] = row.routineId
    ? await db
        .select({
          nextRunAt: routines.nextRunAt,
          enabled: routines.enabled,
          lastStatus: routines.lastStatus,
          lastError: routines.lastError,
        })
        .from(routines)
        .where(and(eq(routines.id, row.routineId), eq(routines.userId, userId)))
    : []
  return {
    ...settings,
    enabled: settings.enabled && routine?.enabled === true,
    nextRunAt: routine?.nextRunAt ?? null,
    lastStatus: routine?.lastStatus ?? null,
    lastError: routine?.lastError ?? null,
  }
}

export async function saveFantasySettings(
  userId: string,
  botId: string,
  input: unknown,
  deps = { createRoutine, updateRoutine }
) {
  await ownedBot(userId, botId)
  const values = fantasyFootballSettingsSchema.parse(input)
  const teamUrl = values.teamUrl ? canonicalEspnTeamUrl(values.teamUrl)! : ""
  return withSandboxLock(`fantasy:${botId}`, async () => {
    const current = await readFantasySettings(userId, botId)
    // Revocation must succeed even if a missing/changed routine cannot be
    // recreated (for example the account has reached its routine limit).
    if (
      current &&
      (values.mode === "manual" ||
        !values.enabled ||
        current.teamUrl !== teamUrl)
    ) {
      await db
        .update(fantasyFootballSettings)
        .set({ mode: "manual", enabled: false, updatedAt: new Date() })
        .where(
          and(
            eq(fantasyFootballSettings.botId, botId),
            eq(fantasyFootballSettings.userId, userId)
          )
        )
    }
    let routineId = current?.routineId ?? null
    const schedule = {
      kind: "daily" as const,
      time: values.checkTime,
      days: [0, 1, 2, 3, 4, 5, 6],
    }
    const [existing] = routineId
      ? await db
          .select({ id: routines.id })
          .from(routines)
          .where(and(eq(routines.id, routineId), eq(routines.userId, userId)))
      : []
    if (existing) {
      await deps.updateRoutine(userId, existing.id, {
        enabled: values.enabled,
        timezone: values.timezone,
        schedule,
        prompt: fantasyRoutinePrompt,
      })
    } else if (values.enabled) {
      const routine = await deps.createRoutine(userId, {
        requestId: `fantasy-${botId}`,
        botId,
        title: "ESPN lineup check",
        prompt: fantasyRoutinePrompt,
        timezone: values.timezone,
        schedule,
      })
      routineId = routine.id
    } else routineId = null
    await db
      .insert(fantasyFootballSettings)
      .values({ userId, botId, ...values, teamUrl, routineId })
      .onConflictDoUpdate({
        target: fantasyFootballSettings.botId,
        set: { ...values, teamUrl, routineId, updatedAt: new Date() },
      })
    return getFantasySettings(userId, botId)
  })
}
