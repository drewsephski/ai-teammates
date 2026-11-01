import assert from "node:assert/strict"
import test from "node:test"
import {
  accountPlan,
  allowedAppAccounts,
  assertAppCapacity,
  assertBotCapacity,
  planLimits,
} from "../lib/billing-policy"

const now = Date.UTC(2026, 9, 13)
const paidItem = {
  status: "active",
  periodStart: now - 1000,
  periodEnd: now + 1000,
  plan: { features: [{ slug: "bots" }, { slug: "sandboxes" }] },
}

test("a default free subscription has lifetime $1 AI credit and 20 minutes of computer time", () => {
  for (const items of [
    [],
    [{ ...paidItem, periodEnd: null, plan: { features: [{ slug: "bots" }] } }],
  ]) {
    const plan = accountPlan(items, now)
    assert.equal(plan.tier, "free")
    assert.deepEqual(plan.period, { start: null, end: null })
    assert.equal(plan.limits.ai, 1_000_000)
    assert.equal(plan.limits.sandbox, 20 * 60)
  }
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

test("free bot creation stops at one while paid teams retain their existing cap", () => {
  assert.doesNotThrow(() => assertBotCapacity("free", 0))
  assert.throws(
    () => assertBotCapacity("free", 1),
    /free plan includes one bot/
  )
  assert.throws(
    () => assertBotCapacity("free", 2),
    /free plan includes one bot/
  )
  assert.doesNotThrow(() => assertBotCapacity("paid", planLimits.paid.bots - 1))
  assert.throws(
    () => assertBotCapacity("paid", planLimits.paid.bots),
    /up to 50/
  )
})

test("one connected app allows reconnecting it but refuses a second toolkit", () => {
  assert.doesNotThrow(() => assertAppCapacity("free", [], "gmail"))
  const accounts = [{ toolkit: "gmail" }, { toolkit: "gmail" }]
  assert.doesNotThrow(() => assertAppCapacity("free", accounts, "gmail"))
  assert.throws(
    () => assertAppCapacity("free", accounts, "github"),
    /one connected app/
  )
  assert.doesNotThrow(() => assertAppCapacity("paid", accounts, "github"))
})

test("after downgrade, only one app remains available for discovery and execution", () => {
  const accounts = [
    { id: "first", toolkit: "gmail" },
    { id: "second", toolkit: "github" },
    { id: "third", toolkit: "gmail" },
  ]
  assert.deepEqual(allowedAppAccounts("free", accounts), [
    accounts[0],
    accounts[2],
  ])
  assert.deepEqual(allowedAppAccounts("paid", accounts), accounts)
  assert.deepEqual(allowedAppAccounts("free", []), [])
})
