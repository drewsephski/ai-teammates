import * as Sentry from "@sentry/node"
import { schedules } from "@trigger.dev/sdk"

import { dispatchDueRoutines } from "@/lib/routines"
import { settleAbandonedHolds } from "@/lib/usage"

// Starts every routine that is due. Claims advance nextRunAt in the same
// transaction (lib/routines.ts), so a retry or an overlapping run never posts
// a routine twice, and each post is idempotent on its message ID.
export const runRoutines = schedules.task({
  id: "run-routines",
  cron: "* * * * *",
  queue: { concurrencyLimit: 1 },
  maxDuration: 240,
  run: async (_payload, { ctx }) => {
    // Local development shares production's database but posts through the
    // development key, so a dev worker would run people's routines in the
    // wrong environment. Opt in with KRAFTY_DEV_ROUTINES=1 to test locally.
    if (
      ctx.environment.type !== "PRODUCTION" &&
      process.env.KRAFTY_DEV_ROUTINES !== "1"
    )
      return { skipped: "not production" }
    const result = await dispatchDueRoutines()
    // Turns that died before onTurnComplete still spent what they held
    const settled = await settleAbandonedHolds()
    if (
      result.started ||
      result.skipped ||
      result.failed ||
      result.missed ||
      settled
    )
      Sentry.logger.info("Routines dispatched", { ...result, settled })
    return { ...result, settled }
  },
})
