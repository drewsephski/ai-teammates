import { and, eq } from "drizzle-orm"
import * as Sentry from "@sentry/node"
import { db } from "@/db"
import { bots } from "@/db/schema"
import { createBotSandbox, deleteBotSandbox } from "@/lib/e2b"
import { withSandboxLock } from "@/lib/sandbox-lock"

// Serialize with bot deletion/reset. No fake or placeholder computer IDs.
export async function ensureBotComputer(botId: string, userId: string) {
  return withSandboxLock(`bot:${botId}`, async () => {
    const bot = await db.query.bots.findFirst({
      where: and(eq(bots.id, botId), eq(bots.userId, userId)),
    })
    if (!bot) throw new Error("This teammate was deleted or is not yours.")
    if (bot.sandboxId) return bot.sandboxId
    const sandboxId = await createBotSandbox(bot.id)
    try {
      const [saved] = await db
        .update(bots)
        .set({ sandboxId })
        .where(and(eq(bots.id, bot.id), eq(bots.userId, userId)))
        .returning({ id: bots.id })
      if (!saved) throw new Error("This teammate was deleted.")
      return sandboxId
    } catch (error) {
      // Postgres may commit even if the UPDATE response is lost. Do not delete
      // the computer until we know it did not become the registered one.
      let current
      try {
        current = await db.query.bots.findFirst({ where: eq(bots.id, botId) })
      } catch (lookupError) {
        Sentry.captureException(lookupError, { extra: { botId, sandboxId } })
        Sentry.captureException(error, { extra: { botId, sandboxId } })
        throw error
      }
      if (current?.sandboxId === sandboxId) return sandboxId
      await deleteBotSandbox(sandboxId).catch((cleanupError) =>
        Sentry.captureException(cleanupError, { extra: { botId, sandboxId } })
      )
      throw error
    }
  })
}
