import * as Sentry from "@sentry/node"
import { schedules } from "@trigger.dev/sdk"

import { db } from "@/db"
import { bots } from "@/db/schema"
import { listBotSandboxes, meterBotSandbox, pauseBotSandbox } from "@/lib/e2b"
import { getUsage } from "@/lib/usage"
import { runSandboxMetering } from "@/lib/sandbox-metering"

// Meter paused sessions too: actual endAt captures short runs between polls.
export const meterSandboxes = schedules.task({
  id: "meter-sandboxes",
  cron: "* * * * *",
  queue: { concurrencyLimit: 1 },
  maxDuration: 240,
  run: async () => {
    const result = await runSandboxMetering({
      list: listBotSandboxes,
      owners: () =>
        db
          .select({ sandboxId: bots.sandboxId, userId: bots.userId })
          .from(bots),
      meter: meterBotSandbox,
      hasUsage: async (userId) => {
        const usage = await getUsage(userId)
        return !!usage && usage.remaining.sandbox > 0
      },
      pause: pauseBotSandbox,
      report: (error, id) =>
        Sentry.captureException(error, {
          tags: { "trigger.task": "meter-sandboxes" },
          extra: { computerOrUserId: id },
        }),
    })
    Sentry.logger.info("E2B sessions metered", result)
    return result
  },
})
