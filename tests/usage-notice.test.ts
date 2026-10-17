import assert from "node:assert/strict"
import test from "node:test"
import { planLimits } from "../lib/billing-policy"
import { usageNotice, usageNoticeCopy } from "../lib/usage-notice"

const periodEnd = new Date(2026, 10, 2, 12)
const paid = (remaining: { ai: number; sandbox: number }) => ({
  tier: "paid" as const,
  period: { end: periodEnd },
  limits: planLimits.paid,
  remaining,
})
const free = (ai: number, sandbox: number = planLimits.free.sandbox) => ({
  tier: "free" as const,
  period: { end: null },
  limits: planLimits.free,
  remaining: { ai, sandbox },
})

test("nothing is shown while every allowance has more than a fifth left", () => {
  assert.equal(
    usageNotice(paid({ ai: 2_500_000, sandbox: 20 * 3600 })),
    undefined
  )
  assert.equal(usageNotice(free(300_000)), undefined)
})

test("a low allowance is mentioned at a fifth or less, and a spent one first", () => {
  assert.deepEqual(usageNotice(paid({ ai: 2_000_000, sandbox: 40 * 3600 })), {
    kind: "ai",
    level: "low",
  })
  assert.deepEqual(usageNotice(paid({ ai: 1_000_000, sandbox: 0 })), {
    kind: "sandbox",
    level: "out",
  })
  // Free plans have no computer hours, so zero of them is not a warning
  assert.deepEqual(usageNotice(free(150_000)), { kind: "ai", level: "low" })
  assert.deepEqual(usageNotice(free(0)), { kind: "ai", level: "out" })
})

test("ChatGPT-backed replies don't warn about the AI allowance", () => {
  assert.equal(usageNotice(free(0), { chatgptSelected: true }), undefined)
  assert.deepEqual(
    usageNotice(paid({ ai: 0, sandbox: 3600 }), { chatgptSelected: true }),
    { kind: "sandbox", level: "low" }
  )
})

test("copy states what is left and leads paid users to usage, free users to plans", () => {
  const lowAI = paid({ ai: 1_400_000, sandbox: 40 * 3600 })
  assert.deepEqual(usageNoticeCopy({ kind: "ai", level: "low" }, lowAI), {
    message: "$1.40 of AI usage left this period.",
    action: { label: "View usage", href: "/usage" },
  })
  assert.equal(
    usageNoticeCopy({ kind: "ai", level: "out" }, paid({ ai: 0, sandbox: 0 }))
      .message,
    "Your AI allowance is used up until November 2."
  )
  assert.equal(
    usageNoticeCopy(
      { kind: "sandbox", level: "low" },
      paid({ ai: 0, sandbox: 5.5 * 3600 })
    ).message,
    "5.5 computer hours left this period."
  )
  assert.equal(
    usageNoticeCopy(
      { kind: "sandbox", level: "low" },
      paid({ ai: 0, sandbox: 61 })
    ).message,
    "1 computer minute left this period."
  )
  assert.deepEqual(
    usageNoticeCopy({ kind: "ai", level: "low" }, free(150_000)),
    {
      message: "$0.15 of your free AI allowance left.",
      action: { label: "Upgrade", href: "/pricing" },
    }
  )
  assert.equal(
    usageNoticeCopy({ kind: "ai", level: "out" }, free(0)).message,
    "Your free AI allowance is used up."
  )
})

test("the free computer time is one-time, so its notices never mention a period", () => {
  assert.deepEqual(usageNotice(free(500_000, 0)), {
    kind: "sandbox",
    level: "out",
  })
  assert.equal(
    usageNoticeCopy({ kind: "sandbox", level: "out" }, free(500_000, 0))
      .message,
    "Your free computer time is used up."
  )
  assert.equal(
    usageNoticeCopy({ kind: "sandbox", level: "low" }, free(500_000, 50))
      .message,
    "1 computer minute left of your free computer time."
  )
})
