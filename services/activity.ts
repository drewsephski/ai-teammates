import { and, count, desc, eq, gt, inArray } from "drizzle-orm"

import { db } from "@/db"
import {
  activityEvents,
  approvals as approvalTable,
  bots,
  morningSummarySchema,
  userSettings,
  type MorningSummarySettings,
} from "@/db/schema"
import { listPendingApprovals } from "@/services/approvals"
import { listRoutines } from "@/services/routines"

// Everything the person's bots are doing on their own: requests waiting for a
// decision, scheduled routines, and what happened recently.
export async function getActivity(userId: string) {
  const [approvals, routines, events, summary] = await Promise.all([
    listPendingApprovals(userId),
    listRoutines(userId),
    db
      .select({
        id: activityEvents.id,
        kind: activityEvents.kind,
        title: activityEvents.title,
        detail: activityEvents.detail,
        botId: activityEvents.botId,
        chatId: activityEvents.chatId,
        createdAt: activityEvents.createdAt,
      })
      .from(activityEvents)
      .where(eq(activityEvents.userId, userId))
      .orderBy(desc(activityEvents.createdAt))
      .limit(50),
    getMorningSummary(userId),
  ])
  const ids = [
    ...new Set(
      [...approvals, ...routines, ...events].flatMap((row) =>
        row.botId ? [row.botId] : []
      )
    ),
  ]
  const owned = ids.length
    ? await db
        .select({ id: bots.id, name: bots.name, avatar: bots.avatar })
        .from(bots)
        .where(and(eq(bots.userId, userId), inArray(bots.id, ids)))
    : []
  return { approvals, routines, events, bots: owned, morningSummary: summary }
}

// Whether the morning summary is on, and whether it can arrive: it goes out
// at 8 a.m. in the person's own timezone, and "UTC" is the unset default
export async function getMorningSummary(userId: string) {
  const [row] = await db
    .select({
      enabled: userSettings.morningSummary,
      timezone: userSettings.timezone,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
  return {
    enabled: row?.enabled ?? true,
    timezoneSet: !!row && row.timezone !== "UTC",
  }
}

export async function updateMorningSummary(
  userId: string,
  input: MorningSummarySettings
) {
  const values = morningSummarySchema.parse(input)
  const [row] = await db
    .insert(userSettings)
    .values({ userId, ...values })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { ...values, updatedAt: new Date() },
    })
    .returning({ morningSummary: userSettings.morningSummary })
  return row
}

export type Activity = Awaited<ReturnType<typeof getActivity>>

// For the sidebar badge, on every page: a read, without expiring old rows
export async function pendingApprovalCount(userId: string) {
  const [row] = await db
    .select({ total: count() })
    .from(approvalTable)
    .where(
      and(
        eq(approvalTable.userId, userId),
        eq(approvalTable.state, "pending"),
        gt(approvalTable.expiresAt, new Date())
      )
    )
  return row?.total ?? 0
}
