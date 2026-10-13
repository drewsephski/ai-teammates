"use server"

import { auth } from "@clerk/nextjs/server"
import * as Sentry from "@sentry/nextjs"
import { and, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { db } from "@/db"
import {
  botInsertSchema,
  bots,
  chatMembers,
  chats,
  type BotInsert,
} from "@/db/schema"
import { deleteBotSandbox } from "@/lib/e2b"
import { provisionTeammate } from "@/lib/teammates"
import { withSandboxLock } from "@/lib/sandbox-lock"
import { getUsage } from "@/lib/usage"

export async function createBot(values: BotInsert) {
  const { isAuthenticated, userId, has } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  // A bot always comes with a sandbox, so creating one takes both
  if (!has({ feature: "bots" }) || !has({ feature: "sandboxes" })) {
    Sentry.logger.warn("Bot creation blocked: upgrade required", {
      "user.id": userId,
    })
    throw new Error("Upgrade required")
  }
  // Provisioning uses compute briefly; the new computer is then paused.
  const usage = await getUsage(userId)
  if (!usage || usage.remaining.sandbox <= 0) {
    Sentry.logger.warn("Bot creation blocked: usage limit reached", {
      "user.id": userId,
      "usage.kind": "sandbox",
    })
    throw new Error("Usage limit reached")
  }

  const data = botInsertSchema.parse(values)

  const { bot } = await provisionTeammate(userId, data)
  revalidatePath("/", "layout")
  Sentry.logger.info("Bot created", { "user.id": userId, "bot.id": bot.id })
  return bot
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
    await deleteBotSandbox(owned.sandboxId)

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
