import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { ZodError } from "zod"

import {
  aiConsentSchema,
  allowsAnthropic,
  ANTHROPIC_CONSENT_VERSION,
  consentVersionOf,
  createConsentCache,
} from "../lib/ai-consent"
import { anthropicAllowed } from "../lib/ai-consent-store"
import { AI_CONSENT_SAVE_ERROR, recordAIConsent } from "../services/ai-consent"

test("only consent v3 or later, the first to name Anthropic, allows it", () => {
  assert.equal(ANTHROPIC_CONSENT_VERSION, 3)
  for (const version of [null, undefined, 0, 1, 2])
    assert.equal(allowsAnthropic(version), false)
  for (const version of [3, 4, 10]) assert.equal(allowsAnthropic(version), true)
})

test("the stored version is read from Clerk private metadata only when valid", () => {
  assert.equal(consentVersionOf({ aiConsentVersion: 3 }), 3)
  for (const metadata of [
    undefined,
    null,
    "3",
    {},
    { aiConsentVersion: "3" },
    { aiConsentVersion: 2.5 },
    { aiConsentVersion: 0 },
    { aiConsentVersion: -3 },
    { aiConsentVersion: null },
  ])
    assert.equal(consentVersionOf(metadata), null)
})

test("the app reports a whole version, or null to withdraw", () => {
  assert.deepEqual(aiConsentSchema.parse({ version: 3 }), { version: 3 })
  assert.deepEqual(aiConsentSchema.parse({ version: null }), { version: null })
  for (const body of [
    {},
    { version: "3" },
    { version: 0 },
    { version: 3.5 },
    { version: 10_000 },
    null,
  ])
    assert.equal(aiConsentSchema.safeParse(body).success, false)
})

test("the cache asks Clerk again after it expires and never keeps a failure", async () => {
  let clock = 0
  let calls = 0
  let fail = false
  const cache = createConsentCache(
    async () => {
      calls++
      if (fail) throw new Error("Clerk is down")
      return 3
    },
    { ttlMs: 1000, now: () => clock }
  )
  assert.equal(await cache.get("user_a"), 3)
  assert.equal(await cache.get("user_a"), 3)
  assert.equal(calls, 1)
  clock = 1000
  fail = true
  await assert.rejects(cache.get("user_a"), /Clerk is down/)
  await assert.rejects(cache.get("user_a"), /Clerk is down/)
  assert.equal(calls, 3)
  // A save is seen at once in this process, a withdrawal included
  cache.set("user_a", null)
  assert.equal(await cache.get("user_a"), null)
  assert.equal(calls, 3)
})

test("without an Anthropic key no account is routed to it, and Clerk isn't asked", async () => {
  const saved = process.env.ANTHROPIC_API_KEY
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    throw new Error("Clerk must not be called")
  })
  try {
    delete process.env.ANTHROPIC_API_KEY
    assert.equal(await anthropicAllowed("user_a"), false)
    assert.equal(fetchMock.mock.callCount(), 0)
  } finally {
    fetchMock.mock.restore()
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = saved
  }
})

test("an unreadable permission falls back to the gateway", async () => {
  const saved = process.env.ANTHROPIC_API_KEY
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed")
  })
  try {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    assert.equal(await anthropicAllowed("user_unreadable"), false)
  } finally {
    fetchMock.mock.restore()
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = saved
  }
})

test("recording a permission saves the parsed version for that account", async () => {
  const saves: [string, number | null][] = []
  const save = async (userId: string, version: number | null) => {
    saves.push([userId, version])
  }
  assert.deepEqual(await recordAIConsent("user_a", { version: 3 }, save), {
    version: 3,
  })
  assert.deepEqual(await recordAIConsent("user_a", { version: null }, save), {
    version: null,
  })
  assert.deepEqual(saves, [
    ["user_a", 3],
    ["user_a", null],
  ])
  await assert.rejects(
    recordAIConsent("user_a", { version: "3" }, save),
    ZodError
  )
  assert.equal(saves.length, 2)
})

test("a failed save is reported as a retryable upstream error", async () => {
  await assert.rejects(
    recordAIConsent("user_a", { version: 3 }, async () => {
      throw new Error("Clerk is down")
    }),
    { message: AI_CONSENT_SAVE_ERROR }
  )
})
