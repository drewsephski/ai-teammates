import assert from "node:assert/strict"
import { generateKeyPairSync, randomBytes, verify } from "node:crypto"
import { test } from "node:test"

import {
  AppleRequestError,
  APPLE_REVOKE_URL,
  APPLE_TOKEN_URL,
  appleClientSecret,
  appleSignInConfig,
  appleSubjectsOf,
  decryptAppleRefreshToken,
  encryptAppleRefreshToken,
  exchangeAppleCode,
  revokeAppleToken,
  type AppleSignInConfig,
} from "../lib/apple-signin"

// A throwaway P-256 key made for this test run, never a real Apple key
const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
})
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
const env = {
  APPLE_TEAM_ID: "TEAM123456",
  APPLE_SIWA_KEY_ID: "KEY1234567",
  APPLE_SIWA_PRIVATE_KEY: pem,
  APPLE_SIWA_CLIENT_ID: "app.kraftybot.mobile",
  APPLE_SIWA_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
}

function config(): AppleSignInConfig {
  const result = appleSignInConfig(env)
  assert.ok(result.ok)
  return result.config
}

const decode = (part: string) =>
  JSON.parse(Buffer.from(part, "base64url").toString("utf8"))

function idToken(claims: Record<string, unknown>) {
  return `${Buffer.from("{}").toString("base64url")}.${Buffer.from(
    JSON.stringify(claims)
  ).toString("base64url")}.sig`
}

type Seen = { url: string; form: URLSearchParams; headers: Headers }
function fakeFetch(respond: (seen: Seen) => Response) {
  const seen: Seen[] = []
  const fetcher = (async (url: string | URL, init?: RequestInit) => {
    const entry = {
      url: String(url),
      form: new URLSearchParams(String(init?.body)),
      headers: new Headers(init?.headers),
    }
    seen.push(entry)
    return respond(entry)
  }) as typeof fetch
  return { seen, fetcher }
}

test("the client secret is an ES256 JWT Apple can verify with the key", () => {
  const now = Date.UTC(2026, 9, 17, 12)
  const jwt = appleClientSecret(config(), "app.kraftybot.mobile", now)
  const [header, claims, signature] = jwt.split(".")
  assert.deepEqual(decode(header!), { alg: "ES256", kid: "KEY1234567" })
  const iat = now / 1000
  assert.deepEqual(decode(claims!), {
    iss: "TEAM123456",
    iat,
    exp: iat + 300,
    aud: "https://appleid.apple.com",
    sub: "app.kraftybot.mobile",
  })
  // JOSE signatures are the raw 64-byte r||s, not DER
  const raw = Buffer.from(signature!, "base64url")
  assert.equal(raw.length, 64)
  assert.ok(
    verify(
      "sha256",
      Buffer.from(`${header}.${claims}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      raw
    )
  )
})

test("config fails closed and names only the variables, never values", () => {
  const missing = appleSignInConfig({ ...env, APPLE_SIWA_PRIVATE_KEY: " " })
  assert.deepEqual(missing, {
    ok: false,
    problem: "Missing APPLE_SIWA_PRIVATE_KEY",
  })
  assert.equal(appleSignInConfig({}).ok, false)
  const broken = appleSignInConfig({ ...env, APPLE_SIWA_PRIVATE_KEY: "nope" })
  assert.equal(broken.ok, false)
  assert.ok(!broken.ok && !broken.problem.includes("nope"))
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString()
  assert.equal(
    appleSignInConfig({ ...env, APPLE_SIWA_PRIVATE_KEY: rsa }).ok,
    false
  )
  assert.equal(
    appleSignInConfig({ ...env, APPLE_SIWA_TOKEN_ENCRYPTION_KEY: "short" }).ok,
    false
  )
  // A PEM pasted with \n escapes still reads
  assert.equal(
    appleSignInConfig({
      ...env,
      APPLE_SIWA_PRIVATE_KEY: pem.replace(/\n/g, "\\n"),
    }).ok,
    true
  )
})

test("exchanging a code posts the form Apple documents and checks the ID token", async () => {
  const { seen, fetcher } = fakeFetch(() =>
    Response.json({
      access_token: "access",
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: "refresh_1",
      id_token: idToken({
        iss: "https://appleid.apple.com",
        aud: "app.kraftybot.mobile",
        sub: "apple_sub_1",
      }),
    })
  )
  assert.deepEqual(await exchangeAppleCode(config(), "code_1", fetcher), {
    refreshToken: "refresh_1",
    subject: "apple_sub_1",
  })
  assert.equal(seen[0]!.url, APPLE_TOKEN_URL)
  assert.equal(
    seen[0]!.headers.get("content-type"),
    "application/x-www-form-urlencoded"
  )
  const form = Object.fromEntries(seen[0]!.form)
  assert.equal(form.client_id, "app.kraftybot.mobile")
  assert.equal(form.code, "code_1")
  assert.equal(form.grant_type, "authorization_code")
  assert.equal(form.client_secret?.split(".").length, 3)
  // Native codes are issued without a redirect URI
  assert.equal(form.redirect_uri, undefined)
})

test("an ID token for another client or issuer is refused", async () => {
  for (const claims of [
    { iss: "https://appleid.apple.com", aud: "app.other", sub: "s" },
    { iss: "https://evil.example", aud: "app.kraftybot.mobile", sub: "s" },
  ]) {
    const { fetcher } = fakeFetch(() =>
      Response.json({ refresh_token: "r", id_token: idToken(claims) })
    )
    await assert.rejects(
      exchangeAppleCode(config(), "code", fetcher),
      (error) =>
        error instanceof AppleRequestError &&
        error.code === "invalid_token_response" &&
        !error.retryable
    )
  }
})

test("Apple errors say whether a retry can help", async () => {
  const cases: [Response | Error, string, boolean][] = [
    [
      Response.json({ error: "invalid_grant" }, { status: 400 }),
      "invalid_grant",
      false,
    ],
    [
      Response.json({ error: "invalid_client" }, { status: 400 }),
      "invalid_client",
      false,
    ],
    [new Response("busy", { status: 503 }), "http_error", true],
    [new Response("slow down", { status: 429 }), "http_error", true],
    [new TypeError("fetch failed"), "network_error", true],
  ]
  for (const [outcome, code, retryable] of cases) {
    const fetcher = (async () => {
      if (outcome instanceof Error) throw outcome
      return outcome
    }) as typeof fetch
    await assert.rejects(
      revokeAppleToken(config(), "app.kraftybot.mobile", "r", fetcher),
      (error) =>
        error instanceof AppleRequestError &&
        error.code === code &&
        error.retryable === retryable
    )
  }
})

test("revoking posts the refresh token with its type hint", async () => {
  const { seen, fetcher } = fakeFetch(() => new Response(null, { status: 200 }))
  await revokeAppleToken(config(), "app.kraftybot.mobile", "refresh_1", fetcher)
  assert.equal(seen[0]!.url, APPLE_REVOKE_URL)
  const form = Object.fromEntries(seen[0]!.form)
  assert.equal(form.client_id, "app.kraftybot.mobile")
  assert.equal(form.token, "refresh_1")
  assert.equal(form.token_type_hint, "refresh_token")
  assert.equal(form.client_secret?.split(".").length, 3)
})

test("stored tokens are encrypted and only decrypt for their owner and client", () => {
  const key = config().encryptionKey
  const sealed = encryptAppleRefreshToken("refresh_1", "user_a", "app.x", key)
  assert.ok(!sealed.includes("refresh_1"))
  assert.equal(
    decryptAppleRefreshToken(sealed, "user_a", "app.x", key),
    "refresh_1"
  )
  assert.throws(() => decryptAppleRefreshToken(sealed, "user_b", "app.x", key))
  assert.throws(() => decryptAppleRefreshToken(sealed, "user_a", "app.y", key))
  assert.throws(() =>
    decryptAppleRefreshToken(sealed, "user_a", "app.x", randomBytes(32))
  )
})

test("only Apple external accounts count as Apple IDs", () => {
  assert.deepEqual(
    appleSubjectsOf([
      { provider: "oauth_apple", providerUserId: "apple_1" },
      { provider: "oauth_google", providerUserId: "google_1" },
      { provider: "apple", providerUserId: "apple_2" },
      { provider: "oauth_apple", providerUserId: "" },
    ]),
    ["apple_1", "apple_2"]
  )
})
