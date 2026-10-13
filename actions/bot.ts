"use server"

import { auth, currentUser } from "@clerk/nextjs/server"
import * as Sentry from "@sentry/nextjs"
import { and, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
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
import { deleteBotSandbox } from "@/lib/e2b"
import { provisionTeammate } from "@/lib/teammates"
import { withSandboxLock } from "@/lib/sandbox-lock"
import { getUsage } from "@/lib/usage"
import { createBotAvatar } from "@/lib/bot-avatar"
import { botPresets, type BotPresetId } from "@/lib/bot-presets"
import { startBotSetupSession } from "@/lib/bot-setup-session"
import { teamOperationId } from "@/lib/team-policy"

type CreateBotResult =
  | { ok: true; bot: Bot; chatId: string }
  | { ok: false; usageLimit: "ai" | "sandbox" }

export async function createBot(input: {
  requestId: string
  presetId?: BotPresetId
}): Promise<CreateBotResult> {
  const { isAuthenticated, userId, has } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  // The plan must support bots and their on-demand computers.
  if (!has({ feature: "bots" }) || !has({ feature: "sandboxes" })) {
    Sentry.logger.warn("Bot creation blocked: upgrade required", {
      "user.id": userId,
    })
    throw new Error("Upgrade required")
  }
  // Check the authoritative allowances once, without extra client round trips.
  const usage = await getUsage(userId)
  if (!usage) throw new Error("Upgrade required")
  if (usage.remaining.sandbox <= 0) return { ok: false, usageLimit: "sandbox" }
  if (usage.remaining.ai <= 0) return { ok: false, usageLimit: "ai" }

  const requestId = z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .parse(input.requestId)
  const preset =
    input.presetId === undefined
      ? undefined
      : botPresets.find((preset) => preset.id === input.presetId)
  if (input.presetId !== undefined && !preset)
    throw new Error("Unknown starting role")
  const operationId = teamOperationId(userId, "bot-setup", requestId)
  const { bot, chatId } = await provisionTeammate(
    userId,
    {
      name: "New Bot",
      job: preset?.job ?? "Not configured",
      instructions: preset?.instructions ?? null,
      avatar: createBotAvatar(),
    },
    { botId: `bot_${operationId}`, chatId: `chat_${operationId}` },
    { setup: true }
  )
  revalidatePath("/", "layout")
  Sentry.logger.info("Bot created", { "user.id": userId, "bot.id": bot.id })
  // Start model work while the chat shell loads; no computer is provisioned.
  try {
    const user = await currentUser()
    await startBotSetupSession(chatId, bot.id, user?.firstName)
  } catch (error) {
    // The bot exists. Its chat retries startup and shows a recoverable error.
    Sentry.captureException(error, { extra: { botId: bot.id, chatId } })
  }
  return { ok: true, bot, chatId }
}

export async function setBotPinned(botId: string, pinned: boolean) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  const input = z
    .object({ botId: z.string().min(1).max(128), pinned: z.boolean() })
    .parse({ botId, pinned })
  const [bot] = await db
    .update(bots)
    .set({ pinnedAt: input.pinned ? new Date() : null })
    .where(and(eq(bots.id, input.botId), eq(bots.userId, userId)))
    .returning({ id: bots.id })
  if (!bot) throw new Error("Bot not found")
  revalidatePath("/", "layout")
}

export async function updateBot(botId: string, values: BotInsert) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")

  const data = botInsertSchema.parse(values)

  const [bot] = await db
    .update(bots)
    .set({ ...data, instructions: data.instructions || null })
    .where(and(eq(bots.id, botId), eq(bots.userId, userId)))
    .returning()
  if (!bot) throw new Error("Bot not found")

  // The bot shows up in the sidebar and in every chat it fronts
  revalidatePath("/", "layout")

  Sentry.logger.info("Bot updated", { "user.id": userId, "bot.id": bot.id })

  return bot
}

export async function deleteBot(botId: string) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")

  const sandboxId = await withSandboxLock(`bot:${botId}`, async () => {
    const [owned] = await db
      .select({ sandboxId: bots.sandboxId })
      .from(bots)
      .where(and(eq(bots.id, botId), eq(bots.userId, userId)))
    if (!owned) throw new Error("Bot not found")

    // Sandbox first: if this fails the bot stays and the delete can be retried
    if (owned.sandboxId) await deleteBotSandbox(owned.sandboxId)

    await db.transaction(async (tx) => {
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

    return owned.sandboxId
  })

  revalidatePath("/", "layout")

  Sentry.logger.info("Bot deleted", {
    "user.id": userId,
    "bot.id": botId,
    "sandbox.id": sandboxId,
  })
}
