// Exercises real JWT verification, database transactions, and distributed locks
// with fixture provider responses. Creates no Clerk/OpenAI users or paid calls.
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { inArray, eq } from "drizzle-orm"
import { exportJWK, generateKeyPair, SignJWT } from "jose"
import type { Pool } from "pg"

import { db } from "../db"
import {
  chatgptAuthAttempts,
  chatgptConnections,
  usageEntries,
} from "../db/schema"
import {
  getChatGPTAccessToken,
  isChatGPTSelected,
  disconnectChatGPT,
} from "../lib/chatgpt-connection"
import { hashChatGPTValue } from "../lib/chatgpt-crypto"
import { getChatGPTModels, chatGPTModelForUser } from "../lib/chatgpt-model"
import { appModelCost } from "../lib/chatgpt-policy"

const originalFetch = globalThis.fetch
const userId = `chatgpt_fixture_${randomBytes(8).toString("hex")}`
const newUserId = `${userId}_new`
const attempts: string[] = []
const configKeys = [
  "CHATGPT_CLIENT_ID",
  "CHATGPT_CLIENT_SECRET",
  "CHATGPT_REDIRECT_URI",
  "CHATGPT_TOKEN_ENCRYPTION_KEY",
  "CHATGPT_PLAN_USAGE_ENABLED",
] as const
const previousConfig = Object.fromEntries(
  configKeys.map((key) => [key, process.env[key]])
)
const clientId = "oaiapp_krafty_auth_fixture"
Object.assign(process.env, {
  CHATGPT_CLIENT_ID: clientId,
  CHATGPT_CLIENT_SECRET: "",
  CHATGPT_REDIRECT_URI: "http://localhost:3000/api/chatgpt/callback",
  CHATGPT_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  CHATGPT_PLAN_USAGE_ENABLED: "true",
})
const { publicKey, privateKey } = await generateKeyPair("RS256")
const jwk = {
  ...(await exportJWK(publicKey)),
  kid: "fixture",
  alg: "RS256",
  use: "sig",
}
let nonce = ""
let scopes =
  "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct"
let refreshes = 0
let exchanges = 0
let rejectedSignature = false
let rejectRefresh = false
let ticketRequests = 0
let revocations = 0
let subject = "fixture-subject"
let existingEmail = false
let createdUsers = 0
let wrongNonce = false
let wrongAudience = false
let expiredIdentity = false
let expectedTicketUserId = userId
const passed: string[] = []

globalThis.fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init)
  const url = new URL(request.url)
  if (url.origin === "https://auth.openai.com") {
    if (url.pathname.endsWith("openid-configuration"))
      return Response.json({
        issuer: url.origin,
        authorization_endpoint: `${url.origin}/api/accounts/authorize`,
        token_endpoint: `${url.origin}/api/accounts/oauth/token`,
        jwks_uri: `${url.origin}/.well-known/jwks.json`,
        revocation_endpoint: `${url.origin}/revoke`,
        authorization_response_iss_parameter_supported: true,
      })
    if (url.pathname.endsWith("jwks.json"))
      return Response.json({ keys: [jwk] })
    if (url.pathname === "/revoke") {
      revocations++
      return new Response(null, { status: 200 })
    }
    if (url.pathname.endsWith("/token")) {
      const params = new URLSearchParams(await request.text())
      assert.equal(params.get("client_id"), clientId)
      assert.equal(params.get("resource"), "https://api.openai.com/v1")
      if (params.get("grant_type") === "refresh_token") {
        refreshes++
        if (rejectRefresh)
          return Response.json({ error: "invalid_grant" }, { status: 400 })
        return Response.json({
          access_token: `fixture-access-${refreshes}`,
          refresh_token: `fixture-refresh-${refreshes}`,
          expires_in: 3600,
          token_type: "Bearer",
        })
      }
      exchanges++
      assert.ok(params.get("code_verifier"))
      const signingKey = rejectedSignature
        ? (await generateKeyPair("RS256")).privateKey
        : privateKey
      const idToken = await new SignJWT({
        nonce: wrongNonce ? nonce + "wrong" : nonce,
        email: "fixture@example.invalid",
        email_verified: true,
        name: "Fixture",
      })
        .setProtectedHeader({ alg: "RS256", kid: "fixture" })
        .setIssuer(url.origin)
        .setAudience(wrongAudience ? "oaiapp_wrong" : clientId)
        .setSubject(subject)
        .setIssuedAt()
        .setExpirationTime(expiredIdentity ? "-1m" : "5m")
        .sign(signingKey)
      return Response.json({
        id_token: idToken,
        access_token: "fixture-access",
        refresh_token: "fixture-refresh",
        expires_in: 3600,
        token_type: "Bearer",
        scope: scopes,
      })
    }
  }
  if (
    url.origin === "https://api.clerk.com" &&
    url.pathname === "/v1/sign_in_tokens"
  ) {
    ticketRequests++
    const body = (await request.json()) as {
      user_id: string
      expires_in_seconds: number
    }
    assert.equal(body.user_id, expectedTicketUserId)
    assert.equal(body.expires_in_seconds, 60)
    return Response.json({
      object: "sign_in_token",
      id: "fixture-ticket-id",
      user_id: userId,
      token: "fixture-clerk-ticket",
      status: "pending",
      url: "https://example.invalid",
      created_at: Date.now(),
      updated_at: Date.now(),
    })
  }
  if (
    url.origin === "https://api.clerk.com" &&
    url.pathname.startsWith("/v1/users")
  ) {
    const matches = existingEmail && url.searchParams.has("email_address")
    if (url.pathname === "/v1/users/count")
      return Response.json({
        object: "total_count",
        total_count: matches ? 1 : 0,
      })
    if (request.method === "GET")
      return Response.json(
        matches ? [{ object: "user", id: "user_existing_fixture" }] : []
      )
    if (request.method === "POST") {
      const body = (await request.json()) as Record<string, unknown>
      assert.deepEqual(body.email_address, ["fixture@example.invalid"])
      assert.equal(body.skip_password_requirement, true)
      assert.ok(body.legal_accepted_at)
      createdUsers++
      return Response.json({
        object: "user",
        id: newUserId,
        external_id: body.external_id,
      })
    }
  }
  if (url.origin === "https://api.openai.com" && url.pathname === "/v1/models")
    return Response.json({
      models: [
        {
          slug: "fixture-model",
          display_name: "Fixture model",
          visibility: "list",
        },
      ],
    })
  if (
    url.origin === "https://api.openai.com" &&
    url.pathname === "/v1/responses"
  ) {
    assert.ok(
      request.headers.get("authorization")?.startsWith("Bearer fixture-access")
    )
    const body = (await request.json()) as { store: boolean; stream: boolean }
    assert.equal(body.store, false)
    assert.equal(body.stream, true)
    return new Response(
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":3,"output_tokens":2}}}\n\n',
      { headers: { "content-type": "text/event-stream" } }
    )
  }
  throw new Error(`Unexpected fixture request: ${url.origin}${url.pathname}`)
}

const { completeChatGPTAuth, startChatGPTAuth } =
  await import("../lib/chatgpt-auth")

async function attempt(signedIn = true) {
  const result = await startChatGPTAuth(
    signedIn ? "connect" : "sign-in",
    signedIn ? userId : null
  )
  const authUrl = new URL(result.url)
  nonce = authUrl.searchParams.get("nonce")!
  const state = authUrl.searchParams.get("state")!
  attempts.push(hashChatGPTValue(state))
  assert.equal(authUrl.searchParams.get("client_id"), clientId)
  assert.equal(authUrl.searchParams.get("code_challenge_method"), "S256")
  const callback = new URL("http://localhost:3000/api/chatgpt/callback")
  callback.search = new URLSearchParams({
    code: "fixture-code",
    state,
    iss: "https://auth.openai.com",
  }).toString()
  return { ...result, callback }
}
function pass(message: string) {
  passed.push(message)
  console.log(`PASS ${message}`)
}

try {
  const initial = await attempt()
  await assert.rejects(
    completeChatGPTAuth(initial.callback, "wrong-browser", userId)
  )
  assert.equal(exchanges, 0)
  assert.deepEqual(
    await completeChatGPTAuth(initial.callback, initial.browserBinding, userId),
    { ticket: null }
  )
  assert.equal(await isChatGPTSelected(userId), true)
  const stored = await db.query.chatgptConnections.findFirst({
    where: eq(chatgptConnections.userId, userId),
  })
  assert.ok(
    stored?.accessToken && !stored.accessToken.includes("fixture-access")
  )
  pass(
    "browser binding, real JWT verification, account linking and encrypted persistence"
  )
  await assert.rejects(
    completeChatGPTAuth(initial.callback, initial.browserBinding, userId)
  )
  assert.equal(exchanges, 1)
  pass("callback replay rejected before token exchange")

  const invalid = await attempt()
  rejectedSignature = true
  await assert.rejects(
    completeChatGPTAuth(invalid.callback, invalid.browserBinding, userId)
  )
  rejectedSignature = false
  pass("invalid JWT signature rejected")

  const changed = await attempt()
  await assert.rejects(
    completeChatGPTAuth(
      changed.callback,
      changed.browserBinding,
      `${userId}_other`
    )
  )
  pass("session changes cannot link a different user")

  const missingIssuer = await attempt()
  missingIssuer.callback.searchParams.delete("iss")
  await assert.rejects(
    completeChatGPTAuth(
      missingIssuer.callback,
      missingIssuer.browserBinding,
      userId
    )
  )
  pass("required authorization response issuer enforced")

  await db
    .update(chatgptConnections)
    .set({ expiresAt: new Date(0) })
    .where(eq(chatgptConnections.userId, userId))
  const tokens = await Promise.all(
    Array.from({ length: 5 }, () => getChatGPTAccessToken(userId))
  )
  assert.equal(refreshes, 1)
  assert.ok(tokens.every((token) => token === "fixture-access-1"))
  pass("five concurrent requests serialize rotating-token refresh")

  assert.deepEqual(await getChatGPTModels(userId), [
    { id: "fixture-model", name: "Fixture model" },
  ])
  const model = await chatGPTModelForUser(userId)
  const result = await model.doStream({
    prompt: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
  })
  await result.stream.pipeTo(new WritableStream())
  assert.equal(
    appModelCost(true, () => 123),
    0
  )
  const ledger = await db
    .select()
    .from(usageEntries)
    .where(eq(usageEntries.userId, userId))
  assert.equal(ledger.length, 0)
  pass(
    "account catalog and subscription inference leave the app usage ledger untouched"
  )

  const login = await attempt(false)
  assert.deepEqual(
    await completeChatGPTAuth(login.callback, login.browserBinding, null),
    { ticket: "fixture-clerk-ticket" }
  )
  assert.equal(ticketRequests, 1)
  pass(
    "linked ChatGPT identity signs into Clerk with a sixty-second one-time ticket"
  )

  scopes = "openid profile email"
  const identityOnly = await attempt()
  await completeChatGPTAuth(
    identityOnly.callback,
    identityOnly.browserBinding,
    userId
  )
  assert.equal(await isChatGPTSelected(userId), true)
  await assert.rejects(getChatGPTAccessToken(userId))
  pass(
    "declining plan permission blocks inference without silently changing billing"
  )

  await db
    .update(chatgptConnections)
    .set({ enabled: false })
    .where(eq(chatgptConnections.userId, userId))
  const preserveChoice = await attempt(false)
  await completeChatGPTAuth(
    preserveChoice.callback,
    preserveChoice.browserBinding,
    null
  )
  assert.equal(await isChatGPTSelected(userId), false)
  pass("ordinary sign-in preserves a saved Krafty AI preference")

  scopes += " offline_access resource.invoke chatgpt.tokens.use.direct"
  const reconnect = await attempt()
  await completeChatGPTAuth(
    reconnect.callback,
    reconnect.browserBinding,
    userId
  )
  await db
    .update(chatgptConnections)
    .set({ expiresAt: new Date(0) })
    .where(eq(chatgptConnections.userId, userId))
  rejectRefresh = true
  await assert.rejects(getChatGPTAccessToken(userId), /Reconnect/)
  assert.equal(await isChatGPTSelected(userId), true)
  pass(
    "revoked credentials remain selected and cannot silently spend Krafty credit"
  )
  rejectRefresh = false
  const renewed = await attempt()
  await completeChatGPTAuth(renewed.callback, renewed.browserBinding, userId)
  assert.equal((await disconnectChatGPT(userId)).revoked, true)
  assert.equal(revocations, 1)
  assert.equal(await isChatGPTSelected(userId), false)
  pass("disconnect revokes the renewable session and removes local credentials")
  for (const invalidClaim of ["nonce", "audience", "expiry"]) {
    const invalidIdentity = await attempt()
    wrongNonce = invalidClaim === "nonce"
    wrongAudience = invalidClaim === "audience"
    expiredIdentity = invalidClaim === "expiry"
    await assert.rejects(
      completeChatGPTAuth(
        invalidIdentity.callback,
        invalidIdentity.browserBinding,
        userId
      )
    )
    wrongNonce = wrongAudience = expiredIdentity = false
    pass(`invalid identity ${invalidClaim} rejected`)
  }

  subject = "fixture-new-subject"
  expectedTicketUserId = newUserId
  const signup = await attempt(false)
  await completeChatGPTAuth(signup.callback, signup.browserBinding, null)
  assert.equal(createdUsers, 1)
  const createdConnection = await db.query.chatgptConnections.findFirst({
    where: eq(chatgptConnections.userId, newUserId),
  })
  assert.equal(createdConnection?.subject, subject)
  pass(
    "new ChatGPT identities create a Clerk account and receive a one-time session ticket"
  )

  subject = "fixture-existing-email-subject"
  existingEmail = true
  const matchingEmail = await attempt(false)
  await assert.rejects(
    completeChatGPTAuth(
      matchingEmail.callback,
      matchingEmail.browserBinding,
      null
    ),
    (error: Error) => "code" in error && error.code === "link_required"
  )
  assert.equal(createdUsers, 1)
  pass("matching email never automatically links an existing Krafty account")
  console.log(
    `${passed.length} integration checks passed; fixture rows will be removed.`
  )
} finally {
  globalThis.fetch = originalFetch
  for (const key of configKeys) {
    const value = previousConfig[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await db
    .delete(chatgptConnections)
    .where(inArray(chatgptConnections.userId, [userId, newUserId]))
  if (attempts.length)
    await db
      .delete(chatgptAuthAttempts)
      .where(inArray(chatgptAuthAttempts.id, attempts))
  await db.$client.end()
  await (
    globalThis as unknown as { sandboxLockPool?: Pool }
  ).sandboxLockPool?.end()
}
