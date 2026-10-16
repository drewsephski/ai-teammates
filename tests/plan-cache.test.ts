import assert from "node:assert/strict"
import test from "node:test"

import { accountPlan } from "../lib/billing-policy"
import {
  PLAN_FRESH_MS,
  PLAN_STALE_MS,
  cachedPlanAge,
  resolvePlan,
} from "../lib/plan-cache"

const now = Date.parse("2026-10-16T12:00:00Z")
const paid = {
  tier: "paid" as const,
  periodStart: new Date(now - 86_400_000),
  periodEnd: new Date(now + 86_400_000),
}

test("a fresh cached plan is served without calling Clerk", async () => {
  let calls = 0
  const plan = await resolvePlan({
    cached: { ...paid, checkedAt: new Date(now - 1_000) },
    now,
    fetch: async () => {
      calls++
      return accountPlan([])
    },
    save: async () => {},
  })
  assert.equal(calls, 0)
  assert.equal(plan.tier, "paid")
})

test("a stale plan is only used when Clerk is down", async () => {
  const cached = { ...paid, checkedAt: new Date(now - PLAN_FRESH_MS - 1) }
  const saved: unknown[] = []
  const refreshed = await resolvePlan({
    cached,
    now,
    fetch: async () => accountPlan([]),
    save: async (row) => {
      saved.push(row)
    },
  })
  assert.equal(refreshed.tier, "free")
  assert.equal(saved.length, 1)

  let stale = false
  const fallback = await resolvePlan({
    cached,
    now,
    fetch: async () => {
      throw new Error("Clerk unavailable")
    },
    save: async () => {},
    onStale: () => {
      stale = true
    },
  })
  assert.equal(fallback.tier, "paid")
  assert.equal(stale, true)
})

test("an old plan, or a paid period that ended, is never served", async () => {
  assert.equal(
    cachedPlanAge({ ...paid, checkedAt: new Date(now - PLAN_STALE_MS) }, now),
    "missing"
  )
  assert.equal(
    cachedPlanAge(
      { ...paid, periodEnd: new Date(now - 1), checkedAt: new Date(now) },
      now
    ),
    "missing"
  )
  await assert.rejects(
    resolvePlan({
      cached: { ...paid, checkedAt: new Date(now - PLAN_STALE_MS - 1) },
      now,
      fetch: async () => {
        throw new Error("Clerk unavailable")
      },
      save: async () => {},
    }),
    /Clerk unavailable/
  )
})
