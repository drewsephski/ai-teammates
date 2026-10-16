import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { eq } from "drizzle-orm"

import { startTestDatabase } from "./helpers/test-db"

const A = "user_a"
const B = "user_b"

let database: Awaited<ReturnType<typeof startTestDatabase>>
let db: typeof import("../db").db
let schema: typeof import("../db/schema")
let computer: typeof import("../lib/account-computer")

const noSleep = async () => {}
const turn = (n: number, botId = "bot_a1", chatId = "chat_a1") => ({
  runKey: `ai:run_${n}:1`,
  botId,
  chatId,
})

// Sandbox IDs are unique across the whole table
let created = 0
function fakeProvider() {
  const calls: string[] = []
  return {
    calls,
    provider: {
      create: async (userId: string) => {
        calls.push(`create:${userId}`)
        return `sbx_${++created}`
      },
      remove: async (id: string) => {
        calls.push(`remove:${id}`)
      },
      exists: async (id: string) => {
        calls.push(`exists:${id}`)
        return false
      },
      pause: async (id: string) => {
        calls.push(`pause:${id}`)
      },
    },
  }
}

before(async () => {
  database = await startTestDatabase()
  ;({ db } = await import("../db"))
  schema = await import("../db/schema")
  computer = await import("../lib/account-computer")
  await db.insert(schema.bots).values([
    { id: "bot_a1", userId: A, name: "Quill", job: "Writer" },
    { id: "bot_a2", userId: A, name: "Ledger", job: "Analyst" },
    { id: "bot_b1", userId: B, name: "Scout", job: "Researcher" },
    // A computer exists only for someone with a bot
    ...["user_ensure", "user_reset", "user_alive", "user_pause"].map(
      (userId) => ({ id: `bot_${userId}`, userId, name: "Bot", job: "Helps" })
    ),
  ])
  await db.insert(schema.chats).values([
    { id: "chat_a1", userId: A, kind: "direct" },
    { id: "chat_a2", userId: A, kind: "direct" },
  ])
})

after(async () => {
  await database?.stop()
})

test("two concurrent acquires: exactly one wins", async () => {
  const results = await Promise.all([
    computer.acquireComputerLease(A, turn(1), { waitMs: 0, sleep: noSleep }),
    computer.acquireComputerLease(A, turn(2, "bot_a2", "chat_a2"), {
      waitMs: 0,
      sleep: noSleep,
    }),
  ])
  assert.equal(results.filter((result) => result.ok).length, 1)
  const loser = results.find((result) => !result.ok)
  assert.ok(loser && !loser.ok)
  const winnerBot = results[0].ok ? "bot_a1" : "bot_a2"
  assert.equal(loser.heldBy.botId, winnerBot)
  await db
    .update(schema.computers)
    .set({ leaseRunKey: null })
    .where(eq(schema.computers.userId, A))
})

test("release only by the holder's run key", async () => {
  await computer.releaseComputerLease(A, "x")
  assert.deepEqual(
    await computer.acquireComputerLease(A, turn(3), { waitMs: 0 }),
    { ok: true }
  )
  const other = turn(4, "bot_a2", "chat_a2")
  await computer.releaseComputerLease(A, other.runKey)
  const blocked = await computer.acquireComputerLease(A, other, {
    waitMs: 0,
    sleep: noSleep,
  })
  assert.equal(blocked.ok, false)
  assert.deepEqual((await computer.computerInUseBy(A))?.name, "Quill")
  // The holder renews its own lease
  assert.deepEqual(
    await computer.acquireComputerLease(A, turn(3), { waitMs: 0 }),
    { ok: true }
  )
  await computer.releaseComputerLease(A, turn(3).runKey)
  assert.equal(await computer.computerInUseBy(A), null)
  assert.deepEqual(
    await computer.acquireComputerLease(A, other, { waitMs: 0 }),
    { ok: true }
  )
})

test("a waiting acquire succeeds once the holder releases", async () => {
  await computer.releaseComputerLease(A, turn(4).runKey)
  await computer.acquireComputerLease(A, turn(5), { waitMs: 0 })
  let polls = 0
  const result = await computer.acquireComputerLease(
    A,
    turn(6, "bot_a2", "chat_a2"),
    {
      waitMs: 10_000,
      pollMs: 2_000,
      sleep: async () => {
        polls++
        await computer.releaseComputerLease(A, turn(5).runKey)
      },
    }
  )
  assert.deepEqual(result, { ok: true })
  assert.equal(polls, 1)
  await computer.releaseComputerLease(A, turn(6).runKey)
})

test("a long call's hold keeps the lease past the usual two minutes", async () => {
  const holder = turn(30)
  await computer.releaseComputerLease(A, turn(4, "bot_a2", "chat_a2").runKey)
  const now = Date.now()
  assert.deepEqual(
    await computer.acquireComputerLease(A, holder, {
      waitMs: 0,
      holdMs: 600_000,
      now: () => now,
    }),
    { ok: true }
  )
  const [row] = await db
    .select({ expiresAt: schema.computers.leaseExpiresAt })
    .from(schema.computers)
    .where(eq(schema.computers.userId, A))
  assert.equal(row.expiresAt?.getTime(), now + 600_000 + 2 * 60_000)
  // Three minutes later another turn still can't take it
  const other = await computer.acquireComputerLease(
    A,
    turn(31, "bot_a2", "chat_a2"),
    { waitMs: 0, sleep: noSleep, now: () => now + 3 * 60_000 }
  )
  assert.equal(other.ok, false)
  await computer.releaseComputerLease(A, holder.runKey)
})

test("inUseBy hides expired leases, and an expired lease is taken over", async () => {
  await computer.acquireComputerLease(A, turn(7), { waitMs: 0 })
  assert.equal((await computer.computerInUseBy(A))?.botId, "bot_a1")
  await db
    .update(schema.computers)
    .set({ leaseExpiresAt: new Date(Date.now() - 1_000) })
    .where(eq(schema.computers.userId, A))
  assert.equal(await computer.computerInUseBy(A), null)
  assert.deepEqual(
    await computer.acquireComputerLease(A, turn(8, "bot_a2", "chat_a2"), {
      waitMs: 0,
    }),
    { ok: true }
  )
  assert.equal((await computer.computerInUseBy(A))?.name, "Ledger")
  await computer.releaseComputerLease(A, turn(8).runKey)
})

test("the holder's name is owner-scoped", async () => {
  // A lease row pointing at another account's bot never names it
  await db
    .insert(schema.computers)
    .values({
      userId: B,
      leaseBotId: "bot_b1",
      leaseRunKey: "ai:run_9:1",
      leaseExpiresAt: new Date(Date.now() + 60_000),
    })
    .onConflictDoNothing()
  assert.equal((await computer.computerInUseBy(B))?.name, "Scout")
  assert.equal(await computer.computerInUseBy("nobody"), null)
  await db
    .update(schema.computers)
    .set({ leaseBotId: "bot_a1" })
    .where(eq(schema.computers.userId, B))
  const held = await computer.computerInUseBy(B)
  assert.equal(held?.name, "Another bot")
  await db
    .update(schema.computers)
    .set({ leaseBotId: null, leaseRunKey: null, leaseExpiresAt: null })
    .where(eq(schema.computers.userId, B))
})

test("deleting the holding bot clears the holder", async () => {
  await db.insert(schema.bots).values({
    id: "bot_tmp",
    userId: A,
    name: "Temp",
    job: "x",
  })
  await computer.acquireComputerLease(A, turn(10, "bot_tmp", "chat_a1"), {
    waitMs: 0,
  })
  await db.delete(schema.bots).where(eq(schema.bots.id, "bot_tmp"))
  assert.equal((await computer.computerInUseBy(A))?.botId, "")
  await computer.releaseComputerLease(A, turn(10).runKey)
})

test("ensureAccountComputer creates once and reuses the computer", async () => {
  const { provider, calls } = fakeProvider()
  const user = "user_ensure"
  const ids = await Promise.all([
    computer.ensureAccountComputer(user, provider),
    computer.ensureAccountComputer(user, provider),
  ])
  assert.equal(ids[0], ids[1])
  assert.deepEqual(calls, [`create:${user}`])
  assert.equal(await computer.accountComputerId(user), ids[0])
  assert.deepEqual(
    await computer
      .listComputerOwners()
      .then((rows) => rows.filter((row) => row.userId === user)),
    [{ sandboxId: ids[0], userId: user }]
  )
})

test("reset replaces a missing computer, concurrent resets adopt one replacement", async () => {
  const { provider, calls } = fakeProvider()
  const user = "user_reset"
  await assert.rejects(
    computer.resetAccountComputer(user, undefined, provider),
    /not been provisioned/
  )
  const first = await computer.ensureAccountComputer(user, provider)
  const ids = await Promise.all([
    computer.resetAccountComputer(user, first, provider),
    computer.resetAccountComputer(user, first, provider),
  ])
  assert.equal(ids[0], ids[1])
  assert.notEqual(ids[0], first)
  assert.equal(calls.filter((call) => call.startsWith("create")).length, 2)
})

test("reset refuses a computer that still exists", async () => {
  const { provider } = fakeProvider()
  const user = "user_alive"
  const id = await computer.ensureAccountComputer(user, provider)
  await assert.rejects(
    computer.resetAccountComputer(user, id, {
      ...provider,
      exists: async () => true,
    }),
    /still exists/
  )
})

test("pause and delete act on the account's sandbox", async () => {
  const { provider, calls } = fakeProvider()
  const user = "user_pause"
  await computer.pauseAccountComputer(user, provider)
  assert.deepEqual(calls, [])
  const id = await computer.ensureAccountComputer(user, provider)
  await computer.pauseAccountComputer(user, provider)
  await computer.deleteAccountComputer(user, provider)
  assert.deepEqual(calls.slice(1), [`pause:${id}`, `remove:${id}`])
  assert.equal(await computer.accountComputerId(user), null)
})

test("nobody without a bot gets a computer, as during account deletion", async () => {
  const { provider, calls } = fakeProvider()
  await assert.rejects(
    computer.ensureAccountComputer("user_gone", provider),
    /Bot not found/
  )
  await assert.rejects(
    computer.acquireComputerLease("user_gone", turn(40), { waitMs: 0 }),
    /Bot not found/
  )
  assert.deepEqual(calls, [])
  const rows = await db
    .select()
    .from(schema.computers)
    .where(eq(schema.computers.userId, "user_gone"))
  assert.deepEqual(rows, [])
})

test("a renewal never shortens the turn's own lease", async () => {
  const holder = turn(41)
  const now = Date.now()
  await computer.acquireComputerLease(B, holder, {
    waitMs: 0,
    holdMs: 600_000,
    now: () => now,
  })
  await computer.acquireComputerLease(B, holder, {
    waitMs: 0,
    now: () => now + 1_000,
  })
  const [row] = await db
    .select({ expiresAt: schema.computers.leaseExpiresAt })
    .from(schema.computers)
    .where(eq(schema.computers.userId, B))
  assert.equal(row.expiresAt?.getTime(), now + 600_000 + 2 * 60_000)
  await computer.releaseComputerLease(B, holder.runKey)
})

test("renewal extends only the turn's own lease and never takes a free one", async () => {
  const holder = turn(50)
  const now = Date.now()
  // Free: nothing to renew, and nothing is taken
  assert.equal(await computer.renewComputerLease(B, holder.runKey, now), false)
  assert.equal(await computer.computerInUseBy(B), null)
  await computer.acquireComputerLease(B, holder, {
    waitMs: 0,
    holdMs: 600_000,
    now: () => now,
  })
  // Another turn's key renews nothing
  assert.equal(await computer.renewComputerLease(B, turn(51).runKey), false)
  // The holder's renewal keeps the longer hold
  assert.equal(
    await computer.renewComputerLease(B, holder.runKey, now + 1_000),
    true
  )
  const [row] = await db
    .select({ expiresAt: schema.computers.leaseExpiresAt })
    .from(schema.computers)
    .where(eq(schema.computers.userId, B))
  assert.equal(row.expiresAt?.getTime(), now + 600_000 + 2 * 60_000)
  await computer.releaseComputerLease(B, holder.runKey)
  // After release, a late renewal can't take it back
  assert.equal(await computer.renewComputerLease(B, holder.runKey), false)
  assert.equal(await computer.computerInUseBy(B), null)
})

test("a computer being created while the account is deleted doesn't survive it", async () => {
  const user = "user_deleting"
  await db
    .insert(schema.bots)
    .values({ id: "bot_deleting", userId: user, name: "Bot", job: "Helps" })
  const removed: string[] = []
  let finishCreate: () => void = () => {}
  const created = new Promise<void>((resolve) => {
    finishCreate = resolve
  })
  let started: () => void = () => {}
  const creating = new Promise<void>((resolve) => {
    started = resolve
  })
  const provider = {
    create: async () => {
      started()
      await created
      return "sbx_during_delete"
    },
    remove: async (id: string) => void removed.push(id),
    exists: async () => true,
    pause: async () => {},
  }
  // A desktop request passed its checks and is creating the computer
  const ensure = computer.ensureAccountComputer(user, provider)
  await creating
  // deleteAccount: bots first, then the computer under the account's lock,
  // then the final cleanup
  await db.delete(schema.bots).where(eq(schema.bots.userId, user))
  const deletion = computer.deleteAccountComputer(user, provider)
  finishCreate()
  await ensure
  await deletion
  await db.delete(schema.computers).where(eq(schema.computers.userId, user))
  assert.deepEqual(removed, ["sbx_during_delete"])
  assert.equal(
    (await computer.listComputerOwners()).some(
      (owner) => owner.userId === user
    ),
    false
  )
  // A later request can't create one again
  await assert.rejects(
    computer.ensureAccountComputer(user, provider),
    /Bot not found/
  )
})
