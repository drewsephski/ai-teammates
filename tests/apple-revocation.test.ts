import assert from "node:assert/strict"
import { generateKeyPairSync, randomBytes } from "node:crypto"
import { after, before, beforeEach, test } from "node:test"
import { eq } from "drizzle-orm"

import { startTestDatabase } from "./helpers/test-db"
import type { AppleDeps } from "../services/apple"

const A = "user_a"
const B = "user_b"
const CLIENT = "app.kraftybot.mobile"

let database: Awaited<ReturnType<typeof startTestDatabase>>
let db: typeof import("../db").db
let schema: typeof import("../db/schema")
let apple: typeof import("../services/apple")
let lib: typeof import("../lib/apple-signin")

// A throwaway key, never a real Apple key
const env = {
  APPLE_TEAM_ID: "TEAM123456",
  APPLE_SIWA_KEY_ID: "KEY1234567",
  APPLE_SIWA_PRIVATE_KEY: generateKeyPairSync("ec", { namedCurve: "P-256" })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString(),
  APPLE_SIWA_CLIENT_ID: CLIENT,
  APPLE_SIWA_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
}

// A fake appleid.apple.com: each code yields one refresh token for one Apple ID
type Mode = "ok" | "outage" | "invalid_client"
let apple_ = {
  codes: new Map<string, string>(),
  revoked: [] as string[],
  exchanged: [] as string[],
  revokeMode: "ok" as Mode,
  exchangeMode: "ok" as Mode,
}
const linked = new Map<string, string[]>()

const idToken = (sub: string) =>
  `e30.${Buffer.from(
    JSON.stringify({ iss: "https://appleid.apple.com", aud: CLIENT, sub })
  ).toString("base64url")}.sig`

const fetcher = (async (url: string | URL, init?: RequestInit) => {
  const form = new URLSearchParams(String(init?.body))
  const fail = (mode: Mode) =>
    mode === "outage"
      ? new Response("down", { status: 503 })
      : Response.json({ error: "invalid_client" }, { status: 400 })
  if (String(url).endsWith("/auth/token")) {
    if (apple_.exchangeMode !== "ok") return fail(apple_.exchangeMode)
    const code = form.get("code")!
    const sub = apple_.codes.get(code)
    // Codes are single-use
    if (!sub || apple_.exchanged.includes(code))
      return Response.json({ error: "invalid_grant" }, { status: 400 })
    apple_.exchanged.push(code)
    return Response.json({
      access_token: "access",
      refresh_token: `refresh_for_${code}`,
      id_token: idToken(sub),
    })
  }
  if (apple_.revokeMode !== "ok") return fail(apple_.revokeMode)
  apple_.revoked.push(form.get("token")!)
  return new Response(null, { status: 200 })
}) as typeof fetch

function deps(overrides: Partial<AppleDeps> = {}): AppleDeps {
  return {
    config: () => lib.appleSignInConfig(env),
    appleSubjects: async (userId) => linked.get(userId) ?? [],
    fetcher,
    ...overrides,
  }
}

before(async () => {
  database = await startTestDatabase()
  ;({ db } = await import("../db"))
  schema = await import("../db/schema")
  apple = await import("../services/apple")
  lib = await import("../lib/apple-signin")
})

beforeEach(async () => {
  await db.delete(schema.appleSignInGrants)
  apple_ = {
    codes: new Map([
      ["code_a", "apple_a"],
      ["code_a2", "apple_a"],
      ["code_b", "apple_b"],
    ]),
    revoked: [],
    exchanged: [],
    revokeMode: "ok",
    exchangeMode: "ok",
  }
  linked.clear()
  linked.set(A, ["apple_a"])
  linked.set(B, ["apple_b"])
})

after(async () => {
  await database?.stop()
})

test("a sign-in code is exchanged and the refresh token stored encrypted", async () => {
  await apple.saveAppleAuthorization(A, "code_a", deps())
  const [row] = await db.select().from(schema.appleSignInGrants)
  assert.equal(row!.userId, A)
  assert.equal(row!.clientId, CLIENT)
  assert.equal(row!.subject, "apple_a")
  assert.ok(!row!.refreshToken.includes("refresh_for_code_a"))
  const key = Buffer.from(env.APPLE_SIWA_TOKEN_ENCRYPTION_KEY, "hex")
  assert.equal(
    lib.decryptAppleRefreshToken(row!.refreshToken, A, CLIENT, key),
    "refresh_for_code_a"
  )
  // Signing in again replaces the token instead of adding a row
  await apple.saveAppleAuthorization(A, "code_a2", deps())
  const rows = await db.select().from(schema.appleSignInGrants)
  assert.equal(rows.length, 1)
  assert.equal(
    lib.decryptAppleRefreshToken(rows[0]!.refreshToken, A, CLIENT, key),
    "refresh_for_code_a2"
  )
})

test("a code for an Apple ID linked to another account is not stored", async () => {
  // B posts A's code: the Apple ID isn't linked to B
  await assert.rejects(
    apple.saveAppleAuthorization(B, "code_a", deps()),
    /Apple account not found/
  )
  assert.deepEqual(await db.select().from(schema.appleSignInGrants), [])
  // Nothing was revoked on A's behalf either
  assert.deepEqual(apple_.revoked, [])
})

test("saving fails closed without the Apple key", async () => {
  await assert.rejects(
    apple.saveAppleAuthorization(
      A,
      "code_a",
      deps({ config: () => lib.appleSignInConfig({}) })
    ),
    /Couldn't save your Sign in with Apple/
  )
  assert.deepEqual(apple_.exchanged, [])
})

test("deletion revokes the stored token, and only the owner's", async () => {
  await apple.saveAppleAuthorization(A, "code_a", deps())
  await apple.saveAppleAuthorization(B, "code_b", deps())
  assert.equal(await apple.revokeAppleSignIn(B, undefined, deps()), "revoked")
  assert.deepEqual(apple_.revoked, ["refresh_for_code_b"])
})

test("a fresh code at deletion covers an account with no stored token", async () => {
  assert.equal(await apple.revokeAppleSignIn(A, "code_a", deps()), "revoked")
  assert.deepEqual(apple_.revoked, ["refresh_for_code_a"])
})

test("a code for someone else's Apple ID is never revoked", async () => {
  assert.equal(await apple.revokeAppleSignIn(A, "code_b", deps()), "manual")
  assert.deepEqual(apple_.revoked, [])
})

test("without a token or code an Apple account gets the manual fallback", async () => {
  assert.equal(await apple.revokeAppleSignIn(A, undefined, deps()), "manual")
  // A used code falls back too
  apple_.exchanged.push("code_a")
  assert.equal(await apple.revokeAppleSignIn(A, "code_a", deps()), "manual")
  assert.deepEqual(apple_.revoked, [])
})

test("an account that never used Apple needs nothing", async () => {
  linked.delete(A)
  assert.equal(await apple.revokeAppleSignIn(A, undefined, deps()), "none")
  // Even with the key missing
  assert.equal(
    await apple.revokeAppleSignIn(
      A,
      undefined,
      deps({ config: () => lib.appleSignInConfig({}) })
    ),
    "none"
  )
  assert.deepEqual(apple_.exchanged, [])
})

test("a missing key or a rejected request can't block deletion", async () => {
  await apple.saveAppleAuthorization(A, "code_a", deps())
  assert.equal(
    await apple.revokeAppleSignIn(
      A,
      undefined,
      deps({ config: () => lib.appleSignInConfig({}) })
    ),
    "manual"
  )
  apple_.revokeMode = "invalid_client"
  assert.equal(await apple.revokeAppleSignIn(A, undefined, deps()), "manual")
  assert.deepEqual(apple_.revoked, [])
})

test("an Apple outage throws so deletion stops and can be retried", async () => {
  await apple.saveAppleAuthorization(A, "code_a", deps())
  apple_.revokeMode = "outage"
  await assert.rejects(
    apple.revokeAppleSignIn(A, undefined, deps()),
    /Couldn't revoke Sign in with Apple/
  )
  apple_.revokeMode = "ok"
  apple_.exchangeMode = "outage"
  await assert.rejects(
    apple.revokeAppleSignIn(A, "code_a2", deps()),
    /Couldn't revoke Sign in with Apple/
  )
  await assert.rejects(
    apple.revokeAppleSignIn(
      A,
      undefined,
      deps({
        appleSubjects: async () => {
          throw new Error("clerk down")
        },
      })
    ),
    /Couldn't revoke Sign in with Apple/
  )
})

test("account deletion revokes Apple before deleting, then drops the grant", async () => {
  const account = await import("../services/account")
  await apple.saveAppleAuthorization(A, "code_a", deps())
  await apple.saveAppleAuthorization(B, "code_b", deps())
  const calls: string[] = []
  const steps = {
    cancelSubscriptions: async () => {
      calls.push("billing")
    },
    revokeApple: async (userId: string, code: string | undefined) => {
      calls.push("apple")
      return apple.revokeAppleSignIn(userId, code, deps())
    },
    closeChat: async () => {},
    deleteComputer: async () => {},
    deleteBot: async () => {},
    disconnectChatGPT: async () => {
      calls.push("chatgpt")
    },
    disconnectApps: async () => {},
    deleteUser: async () => {
      calls.push("clerk")
    },
  }

  // An outage leaves the grant in place and the Clerk user alive
  apple_.revokeMode = "outage"
  await assert.rejects(account.deleteAccount(A, steps), /Couldn't revoke/)
  assert.deepEqual(calls, ["billing", "apple"])
  assert.equal(
    (
      await db
        .select()
        .from(schema.appleSignInGrants)
        .where(eq(schema.appleSignInGrants.userId, A))
    ).length,
    1
  )

  apple_.revokeMode = "ok"
  calls.length = 0
  assert.deepEqual(await account.deleteAccount(A, steps), {
    appleSignIn: "revoked",
  })
  assert.deepEqual(calls, ["billing", "apple", "chatgpt", "clerk"])
  assert.deepEqual(apple_.revoked, ["refresh_for_code_a"])
  assert.deepEqual(
    (await db.select().from(schema.appleSignInGrants)).map((row) => row.userId),
    [B]
  )
})
