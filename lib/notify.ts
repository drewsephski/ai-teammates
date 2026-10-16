import * as Sentry from "@sentry/node"
import { eq, inArray } from "drizzle-orm"

import { db } from "@/db"
import { activityEvents, pushDevices } from "@/db/schema"
import {
  EXPO_PUSH_URL,
  pushBatches,
  pushMessages,
  unregisteredTokens,
  type PushNotification,
} from "@/lib/push-policy"

type ActivityKind = (typeof activityEvents.$inferInsert)["kind"]

// Sends to every phone the person signed in on. Never throws: a notification
// is a courtesy, and the work it reports has already happened.
export async function sendPush(
  userId: string,
  notification: PushNotification,
  fetchImpl: typeof fetch = fetch
) {
  try {
    const devices = await db
      .select({ token: pushDevices.token })
      .from(pushDevices)
      .where(eq(pushDevices.userId, userId))
    if (!devices.length) return
    const tokens = devices.map((device) => device.token)
    for (const batch of pushBatches(tokens)) {
      const response = await fetchImpl(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(process.env.EXPO_ACCESS_TOKEN && {
            Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}`,
          }),
        },
        body: JSON.stringify(pushMessages(batch, notification)),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error(`Expo push failed: ${response.status}`)
      const stale = unregisteredTokens(batch, await response.json())
      if (stale.length)
        await db.delete(pushDevices).where(inArray(pushDevices.token, stale))
    }
  } catch (error) {
    Sentry.logger.warn("Push notification not sent", {
      "user.id": userId,
      "error.type": error instanceof Error ? error.name : "UnknownError",
    })
  }
}

// Records what a bot did on its own, and tells the person's phone when asked
export async function recordActivity(
  event: {
    userId: string
    kind: ActivityKind
    title: string
    detail?: string
    botId?: string
    chatId?: string
    dedupeKey?: string
  },
  push?: PushNotification
) {
  const [row] = await db
    .insert(activityEvents)
    .values({
      ...event,
      detail: event.detail?.slice(0, 500),
    })
    .onConflictDoNothing({ target: activityEvents.dedupeKey })
    .returning({ id: activityEvents.id })
  // A retried task already sent this one
  if (row && push) await sendPush(event.userId, push)
  return row?.id
}
