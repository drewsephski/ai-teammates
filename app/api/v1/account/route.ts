import * as Sentry from "@sentry/nextjs"
import { z } from "zod"

import { apiRoute, readJson } from "@/lib/api"
import { deleteAccount } from "@/services/account"

// The app sends this literal after the person confirms, so a stray or
// replayed bodiless DELETE can never remove an account
const bodySchema = z.object({ confirm: z.literal("delete my account") })

// Permanently deletes the signed-in account and its data, then the Clerk user
// (which signs out every device). A paid plan must be cancelled first (409).
// Safe to retry after a failure.
export const DELETE = apiRoute(async ({ userId }, request) => {
  bodySchema.parse(await readJson(request))
  await deleteAccount(userId)
  Sentry.logger.info("Account deleted", { "user.id": userId })
  return { ok: true }
})
