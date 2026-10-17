import * as Sentry from "@sentry/nextjs"
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import {
  botInsertSchema,
  bots,
  chatMembers,
  chats,
  type BotInsert,
  type Bot,
} from "@/db/schema"
import { provisionTeammate } from "@/lib/teammates"
import { getUsage } from "@/lib/usage"
import { createBotAvatar } from "@/lib/bot-avatar"
import { botPresets } from "@/lib/bot-presets"
import { startBotSetupSession } from "@/lib/bot-setup-session"
import { teamOperationId } from "@/lib/team-policy"
import { FREE_BOT_LIMIT_ERROR } from "@/lib/billing-policy"
import { usesOwnModel } from "@/lib/ai-provider"
import { canUseAI } from "@/lib/chatgpt-policy"
import {
  pinnedBotOrderSchema,
  pinnedBotOrderUpdates,
} from "@/lib/pinned-bot-order"
import type { Caller } from "@/services/caller"

// The user's bots, oldest first
export async function listBots(userId: string) {
  return db.query.bots.findMany({
    where: eq(bots.userId, userId),
    orderBy: asc(bots.createdAt),
  })
}

export async function findBot(userId: string, botId: string) {
  const bot = await db.query.bots.findFirst({
    where: and(eq(bots.id, botId), eq(bots.userId, userId)),
  })
  return bot ?? null
}

export type CreateBotResult =
  | { ok: true; bot: Bot; chatId: string }
  | { ok: false; usageLimit: "ai" | "sandbox" }
  | { ok: false; planLimit: "bots" }

// Client-made idempotency key, so a retried create never makes a second one
export const requestIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/)

export const createBotInputSchema = z.object({
  requestId: requestIdSchema,
  presetId: z.string().optional(),
})

export async function createBot(
  { userId, has }: Caller,
  input: z.infer<typeof createBotInputSchema>,
  // Read only for the setup greeting, after the bot exists
  firstName?: () => Promise<string | null | undefined>
): Promise<CreateBotResult> {
  if (!has({ feature: "bots" })) {
    Sentry.logger.warn("Bot creation blocked: upgrade required", {
      "user.id": userId,
    })
    throw new Error("Upgrade required")
  }
  // Check the authoritative allowances once, without extra client round trips.
  const usage = await getUsage(userId)
  if (!usage) throw new Error("Upgrade required")
  if (!canUseAI(usage.remaining.ai, await usesOwnModel(userId)))
    return { ok: false, usageLimit: "ai" }

  const { requestId } = createBotInputSchema.parse(input)
  const preset =
    input.presetId === undefined
      ? undefined
      : botPresets.find((preset) => preset.id === input.presetId)
  if (input.presetId !== undefined && !preset)
    throw new Error("Unknown starting role")
  const operationId = teamOperationId(userId, "bot-setup", requestId)
  const provisioned = await provisionTeammate(
    userId,
    {
      name: preset?.name ?? "New Bot",
      job: preset?.job ?? "Not configured",
      instructions: preset?.instructions ?? null,
      avatar: createBotAvatar(),
    },
    { botId: `bot_${operationId}`, chatId: `chat_${operationId}` },
    { setup: !preset, computer: false }
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === FREE_BOT_LIMIT_ERROR)
      return null
    throw error
  })
  if (!provisioned) return { ok: false, planLimit: "bots" }
  const { bot, chatId } = provisioned
  Sentry.logger.info("Bot created", { "user.id": userId, "bot.id": bot.id })
  // Start model work while the chat shell loads; no computer is provisioned.
  try {
    await startBotSetupSession(chatId, bot, await firstName?.())
  } catch (error) {
    // The bot exists. Its chat retries startup and shows a recoverable error.
    Sentry.captureException(error, { extra: { botId: bot.id, chatId } })
  }
  return { ok: true, bot, chatId }
}

export async function setBotPinned(
  userId: string,
  botId: string,
  pinned: boolean
) {
  const input = z
    .object({ botId: z.string().min(1).max(128), pinned: z.boolean() })
    .parse({ botId, pinned })
  const [bot] = await db
    .update(bots)
    .set({ pinnedAt: input.pinned ? new Date() : null })
    .where(and(eq(bots.id, input.botId), eq(bots.userId, userId)))
    .returning({ id: bots.id })
  if (!bot) throw new Error("Bot not found")
}

export async function reorderPinnedBots(userId: string, botIds: string[]) {
  const ids = pinnedBotOrderSchema.parse(botIds)

  await db.transaction(async (tx) => {
    // Lock before reading ordering slots so concurrent reorder/pin changes are atomic.
    const rows = await tx
      .select({ id: bots.id, pinnedAt: bots.pinnedAt })
      .from(bots)
      .where(
        and(
          eq(bots.userId, userId),
          inArray(bots.id, ids),
          isNotNull(bots.pinnedAt)
        )
      )
      .orderBy(bots.id)
      .for("update")
    const updates = pinnedBotOrderUpdates(ids, rows)
    const cases = updates.map(
      ({ id, pinnedAt }) =>
        sql`WHEN ${id} THEN ${pinnedAt.toISOString()}::timestamptz`
    )
    await tx
      .update(bots)
      .set({ pinnedAt: sql`CASE ${bots.id} ${sql.join(cases, sql` `)} END` })
      .where(
        and(
          eq(bots.userId, userId),
          inArray(bots.id, ids),
          isNotNull(bots.pinnedAt)
        )
      )
  })
}

export async function updateBot(
  userId: string,
  botId: string,
  values: BotInsert
) {
  const data = botInsertSchema.parse(values)

  const [bot] = await db
    .update(bots)
    .set({
      ...data,
      instructions: data.instructions || null,
      // Appearance-only edits keep a blank bot's conversational setup active.
      setupComplete: sql`${bots.setupComplete} OR ${data.job !== "Not configured"}`,
    })
    .where(and(eq(bots.id, botId), eq(bots.userId, userId)))
    .returning()
  if (!bot) throw new Error("Bot not found")

  Sentry.logger.info("Bot updated", { "user.id": userId, "bot.id": bot.id })

  return bot
}

export async function deleteBot(userId: string, botId: string) {
  // The account computer stays; a lease this bot held is cleared by the FK.
  await db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: bots.id })
      .from(bots)
      .where(and(eq(bots.id, botId), eq(bots.userId, userId)))
    if (!owned) throw new Error("Bot not found")

    // A direct chat is nothing without its bot; memberships go with the bot
    await tx
      .delete(chats)
      .where(
        and(
          eq(chats.userId, userId),
          eq(chats.kind, "direct"),
          inArray(
            chats.id,
            tx
              .select({ id: chatMembers.chatId })
              .from(chatMembers)
              .where(eq(chatMembers.botId, botId))
          )
        )
      )

    const [bot] = await tx
      .delete(bots)
      .where(and(eq(bots.id, botId), eq(bots.userId, userId)))
      .returning({ id: bots.id })
    if (!bot) throw new Error("Bot not found")
  })

  Sentry.logger.info("Bot deleted", { "user.id": userId, "bot.id": botId })
}
