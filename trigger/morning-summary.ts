import * as Sentry from "@sentry/node"
import { schedules } from "@trigger.dev/sdk"

import { sendMorningSummaries } from "@/lib/morning-summary"

// Every hour, everyone whose morning it is hears what their bots did since
// the last summary (lib/morning-summary.ts). Each person's lastSummaryAt is
// claimed before sending, so a retry never sends twice.
export const morningSummaries = schedules.task({
  id: "morning-summaries",
  cron: "5 * * * *",
  queue: { concurrencyLimit: 1 },
  maxDuration: 600,
  run: async (_payload, { ctx }) => {
    // Local development shares production's database, so a dev worker would
    // claim and send people's summaries too. Opt in with KRAFTY_DEV_ROUTINES=1.
    if (
      ctx.environment.type !== "PRODUCTION" &&
      process.env.KRAFTY_DEV_ROUTINES !== "1"
    )
      return { skipped: "not production" }
    const result = await sendMorningSummaries()
    if (result.sent || result.quiet)
      Sentry.logger.info("Morning summaries sent", result)
    return result
  },
})
