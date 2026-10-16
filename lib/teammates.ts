import * as Sentry from "@sentry/node"
import { and, asc, count, eq, inArray } from "drizzle-orm"
import { nanoid } from "nanoid"

import { db } from "@/db"
import {
  botInsertSchema,
  bots,
  chatMembers,
  chats,
  groupChatInsertSchema,
  type BotInsert,
  type GroupChatInsert,
} from "@/db/schema"
import { createBotSandbox, deleteBotSandbox } from "@/lib/e2b"
import { withSandboxLock } from "@/lib/sandbox-lock"
import { assertBotCapacity, FREE_BOT_LIMIT_ERROR } from "@/lib/billing-policy"
import { getAccountPlan, getUsage } from "@/lib/usage"
import { isChatGPTSelected } from "@/lib/chatgpt-connection"
import { canUseAI } from "@/lib/chatgpt-policy"

// Both plans include bots; computers need the paid plan. Read from the cached
// plan (lib/usage.ts), not Clerk on every agent tool call.
export async function assertTeamAccess(userId: string, computer = false) {
  if (computer && (await getAccountPlan(userId)).tier !== "paid") {
    throw new Error("Upgrade required")
  }
  const usage = await getUsage(userId)
  if (
    !usage ||
    !canUseAI(usage.remaining.ai, await isChatGPTSelected(userId)) ||
    (computer && usage.remaining.sandbox <= 0)
  ) {
    throw new Error("Usage limit reached")
  }
}

export async function assertBotAccess(userId: string, botId: string) {
  const plan = await getAccountPlan(userId)
  if (plan.tier === "paid") return
  const bot = await db.query.bots.findFirst({
    where: eq(bots.userId, userId),
    orderBy: [asc(bots.createdAt), asc(bots.id)],
  })
  if (!bot || bot.id !== botId) throw new Error(FREE_BOT_LIMIT_ERROR)
}

// Used by authenticated actions and durable agent tools; never imports Next.js.
export async function provisionTeammate(
  userId: string,
  values: BotInsert,
  ids = { botId: nanoid(), chatId: nanoid() },
  options: { setup?: boolean; computer?: boolean } = {}
) {
  const data = botInsertSchema.parse(values)
  return withSandboxLock(`team:${userId}`, async () => {
    const existing = await db.query.bots.findFirst({
      where: and(eq(bots.id, ids.botId), eq(bots.userId, userId)),
    })
    if (existing) return { bot: existing, chatId: ids.chatId }
    const [size] = await db
      .select({ value: count() })
      .from(bots)
      .where(eq(bots.userId, userId))
    const plan = await getAccountPlan(userId)
    assertBotCapacity(plan.tier, size.value)
    const computer = !options.setup && options.computer !== false
    await assertTeamAccess(userId, computer)
    // Conversational setup needs no computer. Provision it on the first real
    // desktop/tool request instead of delaying navigation with provider startup.
    const sandboxId = computer ? await createBotSandbox(ids.botId) : null
    try {
      const bot = await db.transaction(async (tx) => {
        const [bot] = await tx
          .insert(bots)
          .values({
            ...data,
            id: ids.botId,
            userId,
            sandboxId,
            instructions: data.instructions || null,
            setupComplete: !options.setup,
          })
          .returning()
        await tx
          .insert(chats)
          .values({ id: ids.chatId, userId, kind: "direct" })
        await tx
          .insert(chatMembers)
          .values({ chatId: ids.chatId, botId: bot.id })
        return bot
      })
      return { bot, chatId: ids.chatId }
    } catch (error) {
      if (sandboxId)
        await deleteBotSandbox(sandboxId).catch((cleanupError: unknown) => {
          Sentry.captureException(cleanupError, {
            extra: { botId: ids.botId, sandboxId },
          })
        })
      throw error
    }
  })
}

export async function provisionGroup(
  userId: string,
  values: GroupChatInsert,
  id = nanoid()
) {
  const data = groupChatInsertSchema.parse(values)
  if ((await getAccountPlan(userId)).tier === "free")
    throw new Error("Group chats require a paid plan.")
  const botIds = [...new Set(data.botIds)]
  if (botIds.length < 2 || botIds.length > 8)
    throw new Error("Pick between two and eight different bots.")
  return db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: bots.id })
      .from(bots)
      .where(and(eq(bots.userId, userId), inArray(bots.id, botIds)))
    if (owned.length !== botIds.length) throw new Error("Bot not found")
    await tx
      .insert(chats)
      .values({ id, userId, kind: "group", name: data.name })
      .onConflictDoNothing()
    const row = await tx.query.chats.findFirst({
      where: and(
        eq(chats.id, id),
        eq(chats.userId, userId),
        eq(chats.kind, "group")
      ),
    })
    if (!row) throw new Error("Chat not found")
    await tx
      .insert(chatMembers)
      .values(botIds.map((botId) => ({ chatId: id, botId })))
      .onConflictDoNothing()
    return row
  })
}
