import assert from "node:assert/strict"
import test from "node:test"
import {
  accountPlan,
  allowedAppAccounts,
  assertAppCapacity,
  assertBotCapacity,
  freePeriod,
  planCount,
  planLimits,
  PRO_TRIAL_DAYS,
} from "../lib/billing-policy"

const now = Date.UTC(2026, 9, 13)
const paidItem = {
  status: "active",
  periodStart: now - 1000,
  periodEnd: now + 1000,
  plan: { features: [{ slug: "bots" }, { slug: "sandboxes" }] },
}

test("a default free subscription renews $1 of AI and 20 computer minutes each calendar month", () => {
  for (const items of [
    [],
    [{ ...paidItem, periodEnd: null, plan: { features: [{ slug: "bots" }] } }],
  ]) {
    const plan = accountPlan(items, now)
    assert.equal(plan.tier, "free")
    assert.deepEqual(plan.period, {
      start: new Date(Date.UTC(2026, 9, 1)),
      end: new Date(Date.UTC(2026, 10, 1)),
    })
    assert.equal(plan.limits.ai, 1_000_000)
    assert.equal(plan.limits.sandbox, 20 * 60)
  }
})

test("the free period is the UTC calendar month, across a year end", () => {
  assert.deepEqual(freePeriod(Date.UTC(2026, 11, 31, 23, 59)), {
    start: new Date(Date.UTC(2026, 11, 1)),
    end: new Date(Date.UTC(2027, 0, 1)),
  })
  // The first instant of a month starts that month's period
  assert.deepEqual(
    freePeriod(Date.UTC(2027, 0, 1)).start,
    new Date(Date.UTC(2027, 0, 1))
  )
})

test("paid allowances require a current paid entitlement, including cancellation grace", () => {
  for (const status of ["active", "canceled"]) {
    const plan = accountPlan([{ ...paidItem, status }], now)
    assert.equal(plan.tier, "paid")
    assert.equal(plan.limits.ai, 10_000_000)
    assert.equal(plan.limits.sandbox, 50 * 60 * 60)
    assert.equal(plan.period.end?.getTime(), paidItem.periodEnd)
  }
  for (const item of [
    { ...paidItem, status: "past_due" },
    { ...paidItem, status: "ended" },
    { ...paidItem, periodEnd: now },
    { ...paidItem, periodStart: now + 1 },
    { ...paidItem, plan: null },
    { ...paidItem, plan: { features: [{ slug: "bots" }] } },
  ])
    assert.equal(accountPlan([item], now).tier, "free")
})

test("a Pro free trial is Pro in full for the trial's period", () => {
  const trialEnd = now + PRO_TRIAL_DAYS * 86_400_000
  const plan = accountPlan(
    [{ ...paidItem, isFreeTrial: true, periodStart: now, periodEnd: trialEnd }],
    now
  )
  assert.equal(plan.tier, "paid")
  assert.deepEqual(plan.limits, planLimits.paid)
  assert.equal(plan.period.end?.getTime(), trialEnd)
  // A trial that ended without converting leaves the account on free
  assert.equal(
    accountPlan(
      [{ ...paidItem, status: "ended", isFreeTrial: true, periodEnd: now - 1 }],
      now
    ).tier,
    "free"
  )
})

test("free bot creation stops at three while paid teams retain their existing cap", () => {
  assert.equal(planLimits.free.bots, 3)
  for (const count of [0, 1, 2])
    assert.doesNotThrow(() => assertBotCapacity("free", count))
  for (const count of [3, 4])
    assert.throws(
      () => assertBotCapacity("free", count),
      /free plan includes three bots/
    )
  assert.doesNotThrow(() => assertBotCapacity("paid", planLimits.paid.bots - 1))
  assert.throws(
    () => assertBotCapacity("paid", planLimits.paid.bots),
    /up to 50/
  )
})

test("three connected apps allow reconnecting one but refuse a fourth toolkit", () => {
  assert.doesNotThrow(() => assertAppCapacity("free", [], "gmail"))
  const accounts = [
    { toolkit: "gmail" },
    { toolkit: "gmail" },
    { toolkit: "slack" },
    { toolkit: "notion" },
  ]
  assert.doesNotThrow(() => assertAppCapacity("free", accounts, "gmail"))
  assert.doesNotThrow(() =>
    assertAppCapacity("free", accounts.slice(0, 3), "github")
  )
  assert.throws(
    () => assertAppCapacity("free", accounts, "github"),
    /three connected apps/
  )
  assert.doesNotThrow(() => assertAppCapacity("paid", accounts, "github"))
})

test("after downgrade, only the first three apps remain available for discovery and execution", () => {
  const accounts = [
    { id: "first", toolkit: "gmail" },
    { id: "second", toolkit: "github" },
    { id: "third", toolkit: "gmail" },
    { id: "fourth", toolkit: "slack" },
    { id: "fifth", toolkit: "notion" },
  ]
  assert.deepEqual(allowedAppAccounts("free", accounts), accounts.slice(0, 4))
  assert.deepEqual(allowedAppAccounts("paid", accounts), accounts)
  assert.deepEqual(allowedAppAccounts("free", []), [])
})

test("plan counts read as words in sentences", () => {
  assert.equal(planCount(1, "bot"), "one bot")
  assert.equal(planCount(3, "connected app"), "three connected apps")
  assert.equal(planCount(12, "routine"), "12 routines")
})
