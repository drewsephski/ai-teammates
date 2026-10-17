import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { RateLimitError, SandboxNotFoundError } from "@e2b/desktop"

import { startTestDatabase } from "./helpers/test-db"

let database: Awaited<ReturnType<typeof startTestDatabase>>
let db: typeof import("../db").db
let schema: typeof import("../db/schema")
let e2b: typeof import("../lib/e2b")

before(async () => {
  database = await startTestDatabase()
  ;({ db } = await import("../db"))
  schema = await import("../db/schema")
  e2b = await import("../lib/e2b")
  await db.insert(schema.computers).values([
    { userId: "free_owner", sandboxId: "sbx_free" },
    { userId: "paid_owner", sandboxId: "sbx_paid" },
  ])
  await db.insert(schema.accountPlans).values([
    { userId: "free_owner", tier: "free" },
    {
      userId: "paid_owner",
      tier: "paid",
      periodStart: new Date(Date.now() - 1000),
      periodEnd: new Date(Date.now() + 86_400_000),
    },
  ])
  await db.insert(schema.usageEntries).values({
    userId: "free_owner",
    kind: "sandbox",
    amount: 250,
    idempotencyKey: "sandbox:e2b-test:250",
  })
})

after(async () => {
  await database?.stop()
})

test("E2B quota, rate-limit and concurrency errors become one calm message", () => {
  const busy = "Computers are busy right now. Try again in a few minutes."
  for (const error of [
    new RateLimitError("Rate limit exceeded"),
    Object.assign(new Error("503"), { name: "ServiceBusyError" }),
    new Error(
      "You have reached the maximum number of concurrent sandboxes (20)"
    ),
    Object.assign(new Error("x"), { statusCode: 429 }),
  ]) {
    const mapped = e2b.mapProviderError(error)
    assert.ok(mapped instanceof Error)
    assert.equal((mapped as Error).message, busy)
    assert.equal((mapped as Error).cause, error)
  }
})

test("other provider errors pass through unchanged", () => {
  const missing = new SandboxNotFoundError("gone")
  const timeout = new Error("provider timeout")
  assert.equal(e2b.mapProviderError(missing), missing)
  assert.equal(e2b.mapProviderError(timeout), timeout)
})

test("the allowance of a computer is its owner's remaining seconds and tier", async () => {
  assert.deepEqual(await e2b.computerAllowance("sbx_free"), {
    seconds: 50,
    tier: "free",
  })
  const paid = await e2b.computerAllowance("sbx_paid")
  assert.equal(paid?.tier, "paid")
  assert.equal(paid?.seconds, 50 * 60 * 60)
  // A computer nobody owns (an orphan) has no allowance to enforce
  assert.equal(await e2b.computerAllowance("sbx_orphan"), null)
})
