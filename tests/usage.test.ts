import assert from "node:assert/strict"
import { after, before, mock, test } from "node:test"

import { startTestDatabase } from "./helpers/test-db"

let database: Awaited<ReturnType<typeof startTestDatabase>>
let db: typeof import("../db").db
let schema: typeof import("../db/schema")
let usage: typeof import("../lib/usage")

const day = 24 * 3_600_000
const monthAgo = () => new Date(Date.now() - 60 * day)

// A fresh cached plan: Clerk is never called
async function plan(
  userId: string,
  tier: "free" | "paid",
  periodStart: Date | null = null
) {
  await db.insert(schema.accountPlans).values({
    userId,
    tier,
    periodStart,
    periodEnd: periodStart ? new Date(Date.now() + 30 * day) : null,
    checkedAt: new Date(),
  })
}

async function spend(userId: string, amount: number, createdAt = new Date()) {
  await db.insert(schema.usageEntries).values({
    userId,
    kind: "sandbox",
    amount,
    idempotencyKey: `sandbox:${userId}:${amount}:${createdAt.getTime()}`,
    createdAt,
  })
}

before(async () => {
  database = await startTestDatabase()
  ;({ db } = await import("../db"))
  schema = await import("../db/schema")
  usage = await import("../lib/usage")
})

after(async () => {
  await database?.stop()
})

test("the free computer allowance is 300 seconds for the account's whole life", async () => {
  await plan("free_user", "free")
  assert.equal((await usage.getUsage("free_user")).remaining.sandbox, 300)
  // Time used long ago still counts: nothing resets the free allowance
  await spend("free_user", 120, monthAgo())
  await spend("free_user", 100)
  assert.deepEqual((await usage.getUsage("free_user")).used.sandbox, 220)
  assert.equal((await usage.getUsage("free_user")).remaining.sandbox, 80)
})

test("the free allowance bottoms out at zero and stays there", async () => {
  await plan("free_spent", "free")
  await spend("free_spent", 290, monthAgo())
  await spend("free_spent", 90)
  const spent = await usage.getUsage("free_spent")
  assert.equal(spent.remaining.sandbox, 0)
  assert.equal(spent.used.sandbox, 380)
})

test("the paid allowance is unchanged and counts only the current period", async () => {
  await plan("paid_user", "paid", new Date(Date.now() - 5 * day))
  await spend("paid_user", 5000, monthAgo())
  await spend("paid_user", 600)
  const paid = await usage.getUsage("paid_user")
  assert.equal(paid.limits.sandbox, 50 * 60 * 60)
  assert.equal(paid.used.sandbox, 600)
  assert.equal(paid.remaining.sandbox, 50 * 60 * 60 - 600)
})

test("deleting decisions read the plan from Clerk, never the cache", async () => {
  const seen: unknown[] = []
  // The cache still says free; Clerk now says paid
  const getPlan = (async (_userId: string, options?: { fresh?: boolean }) => {
    seen.push(options)
    return { tier: options?.fresh ? "paid" : "free" }
  }) as unknown as typeof usage.getAccountPlan
  assert.equal(await usage.isFreePlanVerified("upgraded", getPlan), false)
  assert.deepEqual(seen, [{ fresh: true }])
  const free = (async () => ({
    tier: "free",
  })) as unknown as typeof usage.getAccountPlan
  assert.equal(await usage.isFreePlanVerified("still_free", free), true)
})

test("a failed fresh lookup throws instead of serving the stale cached plan", async () => {
  // A cached free plan, two hours old: stale, but usable during an outage
  await db.insert(schema.accountPlans).values({
    userId: "outage_user",
    tier: "free",
    checkedAt: new Date(Date.now() - 2 * 3_600_000),
  })
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    throw new Error("clerk unreachable")
  })
  try {
    // The ordinary read serves the stale free plan...
    assert.equal((await usage.getAccountPlan("outage_user")).tier, "free")
    // ...which must never be enough to delete something
    await assert.rejects(usage.isFreePlanVerified("outage_user"))
    await assert.rejects(usage.getAccountPlan("outage_user", { fresh: true }))
  } finally {
    fetchMock.mock.restore()
  }
})

// trigger/chat.ts gives back a failed or looping reply's spend as a negative
// entry under the turn's key, next to what it spent
test("a credit gives back the AI allowance a turn spent, once", async () => {
  await plan("credited", "free")
  await usage.holdUsage("credited", "ai:run_1:0", 40_000)
  assert.equal((await usage.getUsage("credited")).remaining.ai, 960_000)
  await usage.recordUsage([
    {
      userId: "credited",
      kind: "ai",
      amount: -55_000,
      idempotencyKey: "ai:run_1:0:credit",
    },
  ])
  await usage.recordUsage([
    {
      userId: "credited",
      kind: "ai",
      amount: 15_000,
      idempotencyKey: "ai:run_1:0:web:call_1",
    },
    {
      userId: "credited",
      kind: "ai",
      amount: 40_000,
      idempotencyKey: "ai:run_1:0",
    },
  ])
  // Retried with the same key: counted once
  await usage.recordUsage([
    {
      userId: "credited",
      kind: "ai",
      amount: -55_000,
      idempotencyKey: "ai:run_1:0:credit",
    },
  ])
  const after = await usage.getUsage("credited")
  assert.equal(after.used.ai, 0)
  assert.equal(after.remaining.ai, 1_000_000)
})
