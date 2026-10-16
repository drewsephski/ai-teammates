import * as Sentry from "@sentry/node"
import { schedules } from "@trigger.dev/sdk"

import { listComputerOwners } from "@/lib/account-computer"
import {
  deleteOrphanSandbox,
  listAppSandboxes,
  meterSandbox,
  meterListedSandbox,
  pauseComputer,
} from "@/lib/e2b"
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
