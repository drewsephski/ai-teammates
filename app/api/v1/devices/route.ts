import { z } from "zod"

import { pushDeviceSchema } from "@/db/schema"
import { apiRoute, readJson } from "@/lib/api"
import { registerDevice, removeDevice } from "@/services/devices"

// { token: "ExponentPushToken[...]", platform: "ios" | "android" }, sent on
// sign-in and whenever Expo rotates the token
export const POST = apiRoute(async ({ userId }, request) =>
  registerDevice(userId, pushDeviceSchema.parse(await readJson(request)))
)

// On sign-out, so the phone stops getting this account's notifications
export const DELETE = apiRoute(async ({ userId }, request) => {
  const { token } = z
    .object({ token: z.string().min(1).max(300) })
    .parse(await readJson(request))
  return removeDevice(userId, token)
})
