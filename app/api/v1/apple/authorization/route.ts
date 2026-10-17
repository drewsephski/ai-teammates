import { z } from "zod"

import { apiRoute, readJson } from "@/lib/api"
import { saveAppleAuthorization } from "@/services/apple"

const bodySchema = z.object({
  authorizationCode: z.string().trim().min(1).max(4096),
})

// The iOS app posts Apple's authorization code right after a native Sign in
// with Apple. The server exchanges it for a refresh token and keeps it,
// encrypted, only to revoke the grant when the account is deleted. The code
// is single-use and short-lived, and is never logged.
export const POST = apiRoute(async ({ userId }, request) => {
  const { authorizationCode } = bodySchema.parse(await readJson(request))
  await saveAppleAuthorization(userId, authorizationCode)
  return { ok: true }
})
