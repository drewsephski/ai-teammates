import * as Sentry from "@sentry/nextjs"
import { z } from "zod"

import { apiRoute, readJson } from "@/lib/api"
import { deleteAccount } from "@/services/account"

// The app sends this literal after the person confirms, so a stray or
// replayed bodiless DELETE can never remove an account
const bodySchema = z.object({
  confirm: z.literal("delete my account"),
  // A fresh Sign in with Apple code the iOS app asks for during deletion, so
  // the server can revoke the Apple grant (services/apple.ts). Never logged.
  appleAuthorizationCode: z.string().trim().min(1).max(4096).optional(),
})

// Permanently deletes the signed-in account and its data, then the Clerk user
// (which signs out every device). Paid subscriptions are canceled during deletion.
// Safe to retry after a failure. `appleSignIn` is "manual" when the person
// must remove Krafty from Sign in with Apple in their Apple Account settings.
export const DELETE = apiRoute(async ({ userId }, request) => {
  const { appleAuthorizationCode } = bodySchema.parse(await readJson(request))
  const { appleSignIn } = await deleteAccount(userId, undefined, {
    appleAuthorizationCode,
  })
  Sentry.logger.info("Account deleted", {
    "user.id": userId,
    "apple.revocation": appleSignIn,
  })
  return { ok: true, appleSignIn }
})
