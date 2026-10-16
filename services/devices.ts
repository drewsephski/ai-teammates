import { and, eq } from "drizzle-orm"

import { db } from "@/db"
import { pushDevices, pushDeviceSchema, type PushDevice } from "@/db/schema"

// A phone signs in on one account at a time: registering moves the token
export async function registerDevice(userId: string, input: PushDevice) {
  const values = pushDeviceSchema.parse(input)
  const now = new Date()
  await db
    .insert(pushDevices)
    .values({ ...values, userId, lastSeenAt: now })
    .onConflictDoUpdate({
      target: pushDevices.token,
      set: { userId, platform: values.platform, lastSeenAt: now },
    })
  return { registered: true }
}

export async function removeDevice(userId: string, token: string) {
  await db
    .delete(pushDevices)
    .where(and(eq(pushDevices.token, token), eq(pushDevices.userId, userId)))
  return { removed: true }
}
