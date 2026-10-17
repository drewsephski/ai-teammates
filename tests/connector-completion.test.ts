import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { eq } from "drizzle-orm"

import { startTestDatabase } from "./helpers/test-db"

// Finishing a mobile connection, offline: the provider's account list and the
// wake are injected. The route's cold-start case (no cookie, no earlier
// request) is this service call with the app's bearer-token user ID.

let database: Awaited<ReturnType<typeof startTestDatabase>>
let db: typeof import("../db").db
let schema: typeof import("../db/schema")
let connectors: typeof import("../services/connectors")

const A = "user_a"
const B = "user_b"
let n = 0
const nextState = () =>
  `2d7c4e10-0000-4000-8000-${String(++n).padStart(12, "0")}`

before(async () => {
  database = await startTestDatabase()
  ;({ db } = await import("../db"))
  schema = await import("../db/schema")
  connectors = await import("../services/connectors")
})
after(async () => {
  await database?.stop()
})

async function attempt(userId: string, extra: Record<string, string> = {}) {
  const state = nextState()
  await db.insert(schema.connectorAuthAttempts).values({
    state,
    userId,
    accountId: "ca_new",
    toolkit: "googlesheets",
    returnUrl: "krafty://apps/connected",
    expiresAt: new Date(Date.now() + 60_000),
    ...extra,
  })
  return state
}

const active =
  (id = "ca_new") =>
  async () => ({
    items: [
      {
        id,
        status: "ACTIVE",
        isDisabled: false,
        toolkit: { slug: "googlesheets" },
      },
    ],
  })

function wakes() {
  const calls: { id: string; userId: string }[] = []
  return {
    calls,
    wake: (async (userId: string, attempt: { state: string }) => {
      calls.push({ id: `connect_${attempt.state}`, userId })
      return { woke: true, inputSeq: 7 }
    }) as never,
  }
}

const exists = async (state: string) =>
  (
    await db
      .select()
      .from(schema.connectorAuthAttempts)
      .where(eq(schema.connectorAuthAttempts.state, state))
  ).length === 1

test("a verified connection from a connect card wakes the bot once, and a repeat gets the same answer", async () => {
  const state = await attempt(A, { chatId: "chat_a", questionId: "call_1" })
  const { calls, wake } = wakes()
  const body = { state, status: "success" as const, accountId: "ca_new" }
  const first = await connectors.finishMobileAppConnection(A, body, {
    loadAccounts: active(),
    wake,
  })
  assert.deepEqual(first, { connected: true, woke: true, inputSeq: 7 })
  // The response is lost; the app asks again. No provider call, no second wake
  const replay = await connectors.finishMobileAppConnection(A, body, {
    loadAccounts: async () => {
      throw new Error("must not ask the provider again")
    },
    wake,
  })
  assert.deepEqual(replay, { connected: true, woke: true, inputSeq: 7 })
  assert.deepEqual(calls, [{ id: `connect_${state}`, userId: A }])
  // The stored result is on the attempt
  const [row] = await db
    .select()
    .from(schema.connectorAuthAttempts)
    .where(eq(schema.connectorAuthAttempts.state, state))
  assert.ok(row.completedAt)
  assert.deepEqual(row.completion, { connected: true, woke: true, inputSeq: 7 })
})

test("the web flow replays too: a retried complete has no cookie and still gets the result", async () => {
  const state = await attempt(A, { chatId: "chat_a", questionId: "call_w" })
  const { calls, wake } = wakes()
  const body = { state, status: "success" as const, accountId: "ca_new" }
  const cookie = JSON.stringify({
    userId: A,
    accountId: "ca_new",
    toolkit: "googlesheets",
    chatId: "chat_a",
    questionId: "call_w",
  })
  const first = await connectors.finishAppConnection(A, body, cookie, {
    loadAccounts: active(),
    wake,
  })
  assert.deepEqual(first, { connected: true, woke: true, inputSeq: 7 })
  // The action already deleted the cookie
  const retry = await connectors.finishAppConnection(A, body, undefined, {
    loadAccounts: active(),
    wake,
  })
  assert.deepEqual(retry, first)
  assert.equal(calls.length, 1)
})

test("another user never gets a stored result", async () => {
  const state = await attempt(A, { chatId: "chat_a" })
  const { wake } = wakes()
  const body = { state, status: "success" as const, accountId: "ca_new" }
  await connectors.finishMobileAppConnection(A, body, {
    loadAccounts: active(),
    wake,
  })
  assert.deepEqual(
    await connectors.finishMobileAppConnection(B, body, {
      loadAccounts: active(),
      wake,
    }),
    { connected: false }
  )
  assert.deepEqual(
    await connectors.finishAppConnection(B, body, undefined, { wake }),
    { connected: false }
  )
})

test("an expired attempt has no stored result to replay", async () => {
  const state = await attempt(A, {
    chatId: "chat_a",
    expiresAt: new Date(Date.now() - 1000),
    completedAt: new Date(),
    completion: { connected: true, woke: true },
  } as never)
  const { wake } = wakes()
  assert.deepEqual(
    await connectors.finishMobileAppConnection(
      A,
      { state, status: "success", accountId: "ca_new" },
      { loadAccounts: active(), wake }
    ),
    { connected: false }
  )
})

test("a connection started from Apps wakes no one and has no woke field", async () => {
  const state = await attempt(A)
  const { calls, wake } = wakes()
  const result = await connectors.finishMobileAppConnection(
    A,
    { state, status: "success", accountId: "ca_new" },
    { loadAccounts: active(), wake }
  )
  assert.deepEqual(result, { connected: true })
  assert.equal(calls.length, 0)
})

test("another user's attempt is rejected and stays for its owner", async () => {
  const state = await attempt(A, { chatId: "chat_a" })
  const { calls, wake } = wakes()
  const result = await connectors.finishMobileAppConnection(
    B,
    { state, status: "success", accountId: "ca_new" },
    // Even a provider that calls the account active changes nothing
    { loadAccounts: active(), wake }
  )
  assert.deepEqual(result, { connected: false })
  assert.equal(calls.length, 0)
  assert.equal(await exists(state), true)
})

test("a cancelled or failed OAuth never wakes the bot as connected", async () => {
  const state = await attempt(A, { chatId: "chat_a", questionId: "call_2" })
  const { calls, wake } = wakes()
  let asked = 0
  const result = await connectors.finishMobileAppConnection(
    A,
    { state, status: "failed", accountId: "ca_new" },
    {
      loadAccounts: async () => {
        asked++
        return active()()
      },
      wake,
    }
  )
  assert.deepEqual(result, { connected: false })
  assert.equal(calls.length, 0)
  assert.equal(asked, 0)
  assert.equal(await exists(state), false)
})

test("a success the provider doesn't show as active doesn't wake the bot", async () => {
  const state = await attempt(A, { chatId: "chat_a" })
  const { calls, wake } = wakes()
  const result = await connectors.finishMobileAppConnection(
    A,
    { state, status: "success", accountId: "ca_new" },
    { loadAccounts: async () => ({ items: [] }), wake }
  )
  assert.deepEqual(result, { connected: false })
  assert.equal(calls.length, 0)
})

test("an unreachable provider keeps the attempt, so the app can retry", async () => {
  const state = await attempt(A, { chatId: "chat_a" })
  const { calls, wake } = wakes()
  const body = { state, status: "success" as const, accountId: "ca_new" }
  await assert.rejects(
    connectors.finishMobileAppConnection(A, body, {
      loadAccounts: async () => {
        throw new Error("down")
      },
      wake,
    }),
    // Sentry isn't initialised under test, so only the rejection is checked
    Error
  )
  assert.equal(await exists(state), true)
  const retry = await connectors.finishMobileAppConnection(A, body, {
    loadAccounts: active(),
    wake,
  })
  assert.equal(retry.connected, true)
  assert.equal(calls.length, 1)
})

test("an account ID that isn't the attempt's account is refused", async () => {
  const state = await attempt(A, { chatId: "chat_a" })
  const { calls, wake } = wakes()
  const result = await connectors.finishMobileAppConnection(
    A,
    { state, status: "success", accountId: "ca_someone_elses" },
    { loadAccounts: active("ca_someone_elses"), wake }
  )
  assert.deepEqual(result, { connected: false })
  assert.equal(calls.length, 0)
})
