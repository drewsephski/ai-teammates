import * as Sentry from "@sentry/node"
import { schedules } from "@trigger.dev/sdk"
import { inArray } from "drizzle-orm"

import { db } from "@/db"
import { bots } from "@/db/schema"
import { listBotSandboxes, meterBotSandbox, pauseBotSandbox } from "@/lib/e2b"
import { getUsage } from "@/lib/usage"

// Meter paused sessions too: actual endAt captures short runs between polls.
export const meterSandboxes = schedules.task({
  id: "meter-sandboxes",
  cron: "* * * * *",
  queue: { concurrencyLimit: 1 },
  maxDuration: 240,
  run: async () => {
    const sandboxes = await listBotSandboxes()
    if (!sandboxes.length) return
    const owned = await db
      .select({ sandboxId: bots.sandboxId, userId: bots.userId })
      .from(bots)
      .where(
        inArray(
          bots.sandboxId,
          sandboxes.map((sandbox) => sandbox.sandboxId)
        )
      )
    for (const bot of owned) await meterBotSandbox(bot.sandboxId)
    let paused = 0
    for (const userId of new Set(owned.map((bot) => bot.userId))) {
      const usage = await getUsage(userId)
      if (usage && usage.remaining.sandbox > 0) continue
      for (const bot of owned.filter((bot) => bot.userId === userId)) {
        if (
          sandboxes.find((sandbox) => sandbox.sandboxId === bot.sandboxId)
            ?.state !== "running"
        )
          continue
        await pauseBotSandbox(bot.sandboxId)
        paused++
      }
    }
    // Failed creation must not leave running unowned compute behind.
    const ids = new Set(owned.map((bot) => bot.sandboxId))
    for (const sandbox of sandboxes) {
      if (!ids.has(sandbox.sandboxId) && sandbox.state === "running") {
        await pauseBotSandbox(sandbox.sandboxId)
        paused++
      }
    }
    Sentry.logger.info("E2B sessions metered", {
      "sandbox.owned": owned.length,
      "sandbox.paused": paused,
    })
    return { metered: owned.length, paused }
  },
})
