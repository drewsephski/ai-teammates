import { apiRoute, readJson } from "@/lib/api"
import {
  appleAuthorizationSchema,
  saveAppleAuthorization,
} from "@/services/apple"

// The iOS app posts Apple's authorization code right after a native Sign in
// with Apple. The server exchanges it for a refresh token and keeps it,
// encrypted, only to revoke the grant when the account is deleted. The code
// is single-use and short-lived, and is never logged.
export const POST = apiRoute(async ({ userId }, request) => {
  const { authorizationCode } = appleAuthorizationSchema.parse(
    await readJson(request)
  )
  await saveAppleAuthorization(userId, authorizationCode)
  return { ok: true }
})
