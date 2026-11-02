import assert from "node:assert/strict"
import { after, before, test } from "node:test"

import { startTestDatabase } from "./helpers/test-db"

let database: Awaited<ReturnType<typeof startTestDatabase>>
let service: typeof import("../services/bots")
let db: typeof import("../db").db
let schema: typeof import("../db/schema")

before(async () => {
  database = await startTestDatabase()
  ;({ db } = await import("../db"))
  schema = await import("../db/schema")
  service = await import("../services/bots")
  await db.insert(schema.accountPlans).values({
    userId: "creation-user",
    tier: "paid",
    checkedAt: new Date(),
    periodStart: new Date(),
    periodEnd: new Date(Date.now() + 86_400_000),
  })
})
after(async () => {
  await database?.stop()
})

test("creation returns the saved bot without waiting for its greeting; retries return the same bot", async () => {
  const deferred: (() => Promise<void>)[] = []
  let nameReads = 0
  let release!: () => void
  const slowName = new Promise<string>((resolve) => {
    release = () => resolve("Drew")
  })
  const input = { requestId: "slow-provider", presetId: "fantasy-football" }
  const caller = { userId: "creation-user", has: () => true }
  const create = () =>
    service.createBot(
      caller,
      input,
      () => {
        nameReads++
        return slowName
      },
      (work) => {
        deferred.push(work)
      }
    )
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      create(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("creation is blocked by greeting startup")),
          1_000
        )
      }),
    ])
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(nameReads, 0)
    assert.equal(deferred.length, 1)
    const retried = await create()
    assert.equal(retried.ok && retried.bot.id, result.bot.id)
    assert.equal((await service.listBots(caller.userId)).length, 1)
  } finally {
    clearTimeout(timer)
    release()
  }
})

test("a failed deferred greeting cannot fail the saved bot", async () => {
  const deferred: (() => Promise<void>)[] = []
  const result = await service.createBot(
    { userId: "creation-user", has: () => true },
    { requestId: "greeting-failure" },
    async () => {
      throw new Error("Identity provider unavailable")
    },
    (work) => {
      deferred.push(work)
    }
  )
  assert.equal(result.ok, true)
  assert.equal(deferred.length, 1)
  await assert.doesNotReject(deferred[0]())
})

test("the first workspace list is owner-scoped and never waits on the activity provider", async () => {
  const { runs } = await import("@trigger.dev/sdk")
  const { mock } = await import("node:test")
  const activity = mock.method(runs, "list", () => {
    throw new Error("must not call the provider")
  })
  try {
    await db
      .insert(schema.bots)
      .values({
        id: "workspace-bot",
        userId: "workspace-user",
        name: "Scout",
        job: "Research",
        setupComplete: true,
      })
    const { listWorkspaceBots } = await import("../services/workspace")
    const bots = await listWorkspaceBots("workspace-user", { activity: false })
    assert.deepEqual(
      bots.map((bot) => bot.id),
      ["workspace-bot"]
    )
    assert.equal(bots[0].activity, "unknown")
    assert.equal(activity.mock.callCount(), 0)
  } finally {
    activity.mock.restore()
  }
})
