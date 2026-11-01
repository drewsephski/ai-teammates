import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import { appWaitlistSchema } from "../lib/app-waitlist"
import { startTestDatabase } from "./helpers/test-db"

describe("app waitlist input", () => {
  it("normalizes email and deduplicates platforms", () => {
    assert.deepEqual(
      appWaitlistSchema.parse({
        email: "  Drew@Example.com ",
        platforms: ["mac", "mac"],
      }),
      { email: "drew@example.com", platforms: ["mac"] }
    )
  })
  it("rejects invalid email, missing devices, unsupported platforms and honeypots", () => {
    for (const input of [
      { email: "bad", platforms: ["mac"] },
      { email: "a@example.com", platforms: [] },
      { email: "a@example.com", platforms: ["android"] },
      { email: "a@example.com", platforms: ["mac"], website: "spam" },
    ])
      assert.equal(appWaitlistSchema.safeParse(input).success, false)
  })
})

describe("app waitlist persistence", () => {
  let database: Awaited<ReturnType<typeof startTestDatabase>>
  let join: typeof import("../services/app-waitlist").joinAppWaitlist
  before(async () => {
    database = await startTestDatabase()
    join = (await import("../services/app-waitlist")).joinAppWaitlist
  })
  after(async () => {
    await database?.stop()
  })
  it("stores both platforms atomically and makes repeat signups idempotent", async () => {
    assert.deepEqual(
      await join({ email: "Drew@Example.com", platforms: ["mac"] }),
      [{ email: "drew@example.com", platform: "mac" }]
    )
    assert.deepEqual(
      await join({ email: "drew@example.com", platforms: ["mac", "iphone"] }),
      [{ email: "drew@example.com", platform: "iphone" }]
    )
    assert.deepEqual(
      await join({ email: "drew@example.com", platforms: ["mac", "iphone"] }),
      []
    )
    const result = await database.pool.query(
      "select email, platform from app_waitlist order by platform"
    )
    assert.deepEqual(result.rows, [
      { email: "drew@example.com", platform: "iphone" },
      { email: "drew@example.com", platform: "mac" },
    ])
  })
  it("rejects invalid submissions before inserting", async () => {
    await assert.rejects(
      join({ email: "bot@example.com", platforms: ["mac"], website: "spam" })
    )
    const result = await database.pool.query(
      "select count(*)::int as count from app_waitlist"
    )
    assert.equal(result.rows[0].count, 2)
  })
})
