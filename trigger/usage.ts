import * as Sentry from "@sentry/node"
import { runs, schedules } from "@trigger.dev/sdk"

import {
  createRetention,
  listComputerOwners,
  releaseStoppedComputerLeases,
} from "@/lib/account-computer"
import {
  deleteOrphanSandbox,
  isSandboxPaused,
  listAppSandboxes,
  meterSandbox,
  meterListedSandbox,
  pauseComputer,
} from "@/lib/e2b"
import { getUsage, isFreePlanVerified } from "@/lib/usage"
import { runSandboxMetering } from "@/lib/sandbox-metering"

const report = (error: unknown, id: string) =>
  Sentry.captureException(error, {
    tags: { "trigger.task": "meter-sandboxes" },
    extra: { computerOrUserId: id },
  })

// Meter paused sessions too: actual endAt captures short runs between polls.
export const meterSandboxes = schedules.task({
  id: "meter-sandboxes",
  cron: "* * * * *",
  queue: { concurrencyLimit: 1 },
  maxDuration: 240,
  run: async () => {
    // A turn that died mid-turn never released the computer: free it and
    // pause it now instead of at the idle pause (#34). Before metering, so
    // this run already bills the shorter session. A run of another
    // environment isn't found, and an unknown run is left alone.
    const leases = await releaseStoppedComputerLeases({
      runStatus: async (runId) =>
        (await runs.retrieve(runId, { retry: { maxAttempts: 1 } })).status,
      tier: async (userId) => (await getUsage(userId))?.tier,
      report,
    }).catch((error: unknown) => {
      report(error, "leases")
      return { released: 0, paused: 0 }
    })
    if (leases.released)
      Sentry.logger.info("Stopped turns' computers released", leases)
    const result = await runSandboxMetering({
      list: listAppSandboxes,
      owners: listComputerOwners,
      // A running computer is read again: a tool may pause it after the list,
      // and metering its stale end time would bill the gap. A paused
      // computer's listed session is final.
      meter: (info) =>
        info.state === "running"
          ? meterSandbox(info.sandboxId)
          : meterListedSandbox(info),
      hasUsage: async (userId) => {
        const usage = await getUsage(userId)
        return !!usage && usage.remaining.sandbox > 0
      },
      pause: pauseComputer,
      kill: deleteOrphanSandbox,
      // Free computers idle 30+ days are deleted, every tenth minute. Deleting
      // is irreversible, so the plan is asked of Clerk directly (never the
      // cache, which can be hours stale after an upgrade) and a failed
      // lookup skips the account. Retries are safe: the row is cleared.
      retention:
        new Date().getUTCMinutes() % 10 === 0
          ? createRetention({
              isFree: (userId) => isFreePlanVerified(userId),
              isPaused: isSandboxPaused,
              report,
            })
          : undefined,
      report,
    })
    Sentry.logger.info("E2B sessions metered", result)
    return result
  },
})
