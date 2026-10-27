import * as Sentry from "@sentry/node"
import {
  and,
  count,
  eq,
  exists,
  gt,
  inArray,
  isNull,
  lt,
  or,
} from "drizzle-orm"

import { db } from "@/db"
import {
  activityEvents,
  approvals,
  pushDevices,
  userSettings,
} from "@/db/schema"
import {
  morningSummary,
  SUMMARY_MIN_GAP_MS,
  summaryDue,
  summaryWindowStart,
} from "@/lib/morning-summary-policy"
import { sendPush } from "@/lib/notify"

const SUMMARY_KINDS = [
  "routine_skipped",
  "routine_failed",
  "approval_requested",
  "question_asked",
  "work_finished",
  "work_failed",
] as const

// Sends each person due a summary this hour at most one, and only when their
// bots did something since the last. The claim on lastSummaryAt is what keeps
// a retried or overlapping run from sending twice.
export async function sendMorningSummaries(
  now = new Date(),
  push: typeof sendPush = sendPush
) {
  // Only people with a phone to send to and a timezone of their own
  const candidates = await db
    .select({
      userId: userSettings.userId,
      morningSummary: userSettings.morningSummary,
      timezone: userSettings.timezone,
      digestHour: userSettings.digestHour,
      lastSummaryAt: userSettings.lastSummaryAt,
    })
    .from(userSettings)
    .where(
      and(
        eq(userSettings.morningSummary, true),
        exists(
          db
            .select({ token: pushDevices.token })
            .from(pushDevices)
            .where(eq(pushDevices.userId, userSettings.userId))
        )
      )
    )

  let sent = 0
  let quiet = 0
  for (const settings of candidates) {
    if (!summaryDue(settings, now)) continue
    try {
      const [claimed] = await db
        .update(userSettings)
        .set({ lastSummaryAt: now })
        .where(
          and(
            eq(userSettings.userId, settings.userId),
            or(
              isNull(userSettings.lastSummaryAt),
              lt(
                userSettings.lastSummaryAt,
                new Date(now.getTime() - SUMMARY_MIN_GAP_MS)
              )
            )
          )
        )
        .returning({ userId: userSettings.userId })
      if (!claimed) continue

      const since = summaryWindowStart(settings.lastSummaryAt, now)
      const [events, [waiting]] = await Promise.all([
        db
          .select({ kind: activityEvents.kind })
          .from(activityEvents)
          .where(
            and(
              eq(activityEvents.userId, settings.userId),
              gt(activityEvents.createdAt, since),
              inArray(activityEvents.kind, [...SUMMARY_KINDS])
            )
          ),
        db
          .select({ total: count() })
          .from(approvals)
          .where(
            and(
              eq(approvals.userId, settings.userId),
              eq(approvals.state, "pending"),
              gt(approvals.expiresAt, now)
            )
          ),
      ])
      const summary = morningSummary(events, waiting?.total ?? 0)
      if (!summary) {
        quiet++
        continue
      }
      await push(settings.userId, summary)
      sent++
    } catch (error) {
      Sentry.captureException(error, { extra: { userId: settings.userId } })
    }
  }
  return { candidates: candidates.length, sent, quiet }
}
