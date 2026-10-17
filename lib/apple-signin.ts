import { createPrivateKey, sign, type KeyObject } from "node:crypto"

import { decryptChatGPTValue, encryptChatGPTValue } from "@/lib/chatgpt-crypto"

// Sign in with Apple REST API: exchange an authorization code for a refresh
// token (/auth/token) and revoke it when the account is deleted (/auth/revoke).
// https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens
// https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens
// No @/db, Sentry or Next.js here: services/apple.ts does the storage and logs.

export const APPLE_ISSUER = "https://appleid.apple.com"
export const APPLE_TOKEN_URL = `${APPLE_ISSUER}/auth/token`
export const APPLE_REVOKE_URL = `${APPLE_ISSUER}/auth/revoke`

// Apple rejects a client secret that expires more than six months out. Ours
// is made per request, so a few minutes is plenty.
const CLIENT_SECRET_TTL_SECONDS = 5 * 60

export type AppleSignInConfig = {
  teamId: string
  keyId: string
  privateKey: KeyObject
  // The App ID the native app signs in with (the bundle ID). A code is only
  // accepted for the client it was issued to.
  clientId: string
  encryptionKey: Buffer
}

export const APPLE_ENV = [
  "APPLE_TEAM_ID",
  "APPLE_SIWA_KEY_ID",
  "APPLE_SIWA_PRIVATE_KEY",
  "APPLE_SIWA_CLIENT_ID",
  "APPLE_SIWA_TOKEN_ENCRYPTION_KEY",
] as const

export type AppleConfigResult =
  { ok: true; config: AppleSignInConfig } | { ok: false; problem: string }

// Reads the Sign in with Apple key from the environment. Never throws, so a
// missing or broken key can't stop an account deletion; callers log `problem`
// (variable names only, never values).
export function appleSignInConfig(
  env: Record<string, string | undefined> = process.env
): AppleConfigResult {
  const missing = APPLE_ENV.filter((name) => !env[name]?.trim())
  if (missing.length)
    return { ok: false, problem: `Missing ${missing.join(", ")}` }
  const teamId = env.APPLE_TEAM_ID!.trim()
  const keyId = env.APPLE_SIWA_KEY_ID!.trim()
  const clientId = env.APPLE_SIWA_CLIENT_ID!.trim()
  if (!/^[A-Z\d]{10}$/.test(teamId))
    return { ok: false, problem: "APPLE_TEAM_ID is not a 10-character Team ID" }
  if (!/^[A-Z\d]{10}$/.test(keyId))
    return {
      ok: false,
      problem: "APPLE_SIWA_KEY_ID is not a 10-character key ID",
    }
  const hex = env.APPLE_SIWA_TOKEN_ENCRYPTION_KEY!.trim()
  if (!/^[a-f\d]{64}$/i.test(hex))
    return {
      ok: false,
      problem: "APPLE_SIWA_TOKEN_ENCRYPTION_KEY is not 64 hex characters",
    }
  let privateKey: KeyObject
  try {
    // Railway variables often hold a PEM with literal \n escapes
    privateKey = createPrivateKey(
      env.APPLE_SIWA_PRIVATE_KEY!.trim().replace(/\\n/g, "\n")
    )
  } catch {
    return {
      ok: false,
      problem: "APPLE_SIWA_PRIVATE_KEY is not a readable key",
    }
  }
  if (
    privateKey.asymmetricKeyType !== "ec" ||
    privateKey.asymmetricKeyDetails?.namedCurve !== "prime256v1"
  )
    return { ok: false, problem: "APPLE_SIWA_PRIVATE_KEY is not a P-256 key" }
  return {
    ok: true,
    config: {
      teamId,
      keyId,
      privateKey,
      clientId,
      encryptionKey: Buffer.from(hex, "hex"),
    },
  }
}

const base64url = (value: string | Buffer) =>
  Buffer.from(value).toString("base64url")

// The client secret is an ES256 JWT signed with the Sign in with Apple key:
// header { alg, kid }, claims { iss: Team ID, iat, exp, aud: appleid, sub:
// client ID }. JOSE wants the raw r||s signature, not DER.
export function appleClientSecret(
  config: Pick<AppleSignInConfig, "teamId" | "keyId" | "privateKey">,
  clientId: string,
  now = Date.now()
) {
  const iat = Math.floor(now / 1000)
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }))
  const claims = base64url(
    JSON.stringify({
      iss: config.teamId,
      iat,
      exp: iat + CLIENT_SECRET_TTL_SECONDS,
      aud: APPLE_ISSUER,
      sub: clientId,
    })
  )
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
    key: config.privateKey,
    dsaEncoding: "ieee-p1363",
  })
  return `${header}.${claims}.${base64url(signature)}`
}

// An Apple request that failed. `retryable` is a network failure, a rate limit
// or an Apple outage; anything else (a bad key, a used code) won't get better
// by asking again.
export class AppleRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryable: boolean
  ) {
    super(`Apple ${code} (${status})`)
  }
}

type Fetcher = typeof fetch

async function postForm(
  fetcher: Fetcher,
  url: string,
  form: Record<string, string>
) {
  let response: Response
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new AppleRequestError(0, "network_error", true)
  }
  if (response.ok) return response
  const body = (await response.json().catch(() => null)) as {
    error?: unknown
  } | null
  const code = typeof body?.error === "string" ? body.error : "http_error"
  throw new AppleRequestError(
    response.status,
    code,
    response.status === 429 || response.status >= 500
  )
}

function decodeClaims(jwt: string) {
  const payload = jwt.split(".")[1]
  if (!payload) return null
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      iss?: unknown
      aud?: unknown
      sub?: unknown
    }
  } catch {
    return null
  }
}

// Validates a native authorization code. The ID token comes straight from
// Apple's token endpoint over TLS, so its claims are read without checking the
// signature (OpenID Connect Core 3.1.3.7), but issuer and audience must match.
// Native codes carry no redirect_uri, so none is sent.
export async function exchangeAppleCode(
  config: AppleSignInConfig,
  code: string,
  fetcher: Fetcher = fetch,
  now = Date.now()
) {
  const response = await postForm(fetcher, APPLE_TOKEN_URL, {
    client_id: config.clientId,
    client_secret: appleClientSecret(config, config.clientId, now),
    code,
    grant_type: "authorization_code",
  })
  const body = (await response.json().catch(() => null)) as {
    refresh_token?: unknown
    id_token?: unknown
  } | null
  const claims =
    typeof body?.id_token === "string" ? decodeClaims(body.id_token) : null
  if (
    typeof body?.refresh_token !== "string" ||
    !claims ||
    claims.iss !== APPLE_ISSUER ||
    claims.aud !== config.clientId ||
    typeof claims.sub !== "string"
  )
    throw new AppleRequestError(
      response.status,
      "invalid_token_response",
      false
    )
  return { refreshToken: body.refresh_token, subject: claims.sub }
}

// Revokes a refresh token, which ends the user's authorization for this app.
// Apple answers 200 for a token it already invalidated, so a retry is safe.
export async function revokeAppleToken(
  config: AppleSignInConfig,
  clientId: string,
  refreshToken: string,
  fetcher: Fetcher = fetch,
  now = Date.now()
) {
  await postForm(fetcher, APPLE_REVOKE_URL, {
    client_id: clientId,
    client_secret: appleClientSecret(config, clientId, now),
    token: refreshToken,
    token_type_hint: "refresh_token",
  })
}

// AES-256-GCM, bound to the owner and client so a row copied to another
// account (or client) does not decrypt
export function appleTokenContext(userId: string, clientId: string) {
  return `apple-siwa:${userId}:${clientId}:refresh`
}

export function encryptAppleRefreshToken(
  token: string,
  userId: string,
  clientId: string,
  key: Buffer
) {
  return encryptChatGPTValue(token, appleTokenContext(userId, clientId), key)
}

export function decryptAppleRefreshToken(
  value: string,
  userId: string,
  clientId: string,
  key: Buffer
) {
  return decryptChatGPTValue(value, appleTokenContext(userId, clientId), key)
}

// Clerk names the Apple provider `oauth_apple` in the Backend API
export function appleSubjectsOf(
  accounts: readonly { provider: string; providerUserId: string }[]
) {
  return accounts
    .filter((account) => /^(oauth_)?apple$/.test(account.provider))
    .map((account) => account.providerUserId)
    .filter(Boolean)
}

// What deletion did about the person's Sign in with Apple grant
//  - revoked: Apple confirmed revocation for every linked Apple ID
//  - manual: the person signed in with Apple but a grant could not be revoked
//    here; they must remove Krafty in their Apple Account settings
//  - none: the account never used Sign in with Apple
export type AppleRevocation = "revoked" | "manual" | "none"
