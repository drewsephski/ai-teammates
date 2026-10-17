import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { eq } from "drizzle-orm"

import { startTestDatabase } from "./helpers/test-db"

// Issue #9 (S3): no computer for an account being deleted, and deleting the
// chat or bot that holds the computer frees it for the person's other chats.

let database: Awaited<ReturnType<typeof startTestDatabase>>
let db: typeof import("../db").db
let schema: typeof import("../db/schema")
let computer: typeof import("../lib/account-computer")
let account: typeof import("../services/account")
let bots: typeof import("../services/bots")
let chats: typeof import("../services/chats")

let created = 0
function fakeProvider() {
  const calls: string[] = []
  return {
    calls,
    created: () =>
      calls.flatMap((call) =>
        call.startsWith("create:") ? [call.slice(7)] : []
      ),
    removed: () =>
      calls.flatMap((call) =>
        call.startsWith("remove:") ? [call.slice(7)] : []
      ),
    provider: {
      create: async () => {
        const id = `sbx_del_${++created}`
        calls.push(`create:${id}`)
        return id
      },
      remove: async (id: string) => void calls.push(`remove:${id}`),
      exists: async () => false,
      pause: async () => {},
    },
  }
}

const turn = (n: number, botId: string, chatId: string) => ({
  runKey: `ai:run_del_${n}:1`,
  botId,
  chatId,
})

// The services log with @sentry/nextjs, whose logger needs Next's bundling and
// is undefined under tsx. It runs after the write committed, so only that
// failure is expected here.
const sentryLogOnly = (error: unknown) => {
  if (!(error instanceof TypeError && /reading 'info'/.test(error.message)))
    throw error
}

async function addBot(userId: string, botId: string, chatId?: string) {
  await db
    .insert(schema.bots)
    .values({ id: botId, userId, name: botId, job: "Helps" })
  if (!chatId) return
  await db.insert(schema.chats).values({ id: chatId, userId, kind: "direct" })
  await db.insert(schema.chatMembers).values({ chatId, botId })
}

before(async () => {
  database = await startTestDatabase()
  ;({ db } = await import("../db"))
  schema = await import("../db/schema")
  computer = await import("../lib/account-computer")
  account = await import("../services/account")
  bots = await import("../services/bots")
  chats = await import("../services/chats")
})

after(async () => {
  await database?.stop()
})

test("P1: once a deleting account's bots are gone, a running turn gets no computer", async () => {
  const user = "user_del_turn"
  await addBot(user, "bot_del_turn", "chat_del_turn")
  const { provider, calls } = fakeProvider()
  // The turn takes the lease (creating the account's row) before it asks for
  // the computer, as trigger/chat.ts does
  assert.deepEqual(
    await computer.acquireComputerLease(
      user,
      turn(1, "bot_del_turn", "chat_del_turn"),
      { waitMs: 0 }
    ),
    { ok: true }
  )
  // deleteAccount removes the bots; its computer step hasn't run yet
  await db.delete(schema.bots).where(eq(schema.bots.userId, user))

  await assert.rejects(
    computer.ensureAccountComputer(user, provider),
    /Bot not found|account was deleted/
  )
  // Not even a computer that is removed again: the provider is never asked
  assert.deepEqual(calls, [])
  await assert.rejects(
    computer.acquireComputerLease(
      user,
      turn(2, "bot_del_turn", "chat_del_turn"),
      { waitMs: 0 }
    ),
    /Bot not found/
  )
})

test("P1: a reset while the account is being deleted creates no computer", async () => {
  const user = "user_del_reset"
  await addBot(user, "bot_del_reset")
  const { provider, created: made } = fakeProvider()
  const id = await computer.ensureAccountComputer(user, provider)
  await db.delete(schema.bots).where(eq(schema.bots.userId, user))

  await assert.rejects(computer.resetAccountComputer(user, id, provider))
  assert.deepEqual(made(), [id])
  assert.equal(await computer.accountComputerId(user), id)
})

test("P1: a teammate a running turn creates mid-deletion doesn't outlive the account, nor does its computer", async () => {
  const user = "user_del_account"
  await addBot(user, "bot_del_account", "chat_del_account")
  const fake = fakeProvider()
  const calls: string[] = []
  await account.deleteAccount(user, {
    cancelSubscriptions: async () => {},
    closeChat: async (chatId) => void calls.push(`close:${chatId}`),
    deleteBot: (userId, botId) =>
      bots.deleteBot(userId, botId).catch(sentryLogOnly),
    deleteComputer: (userId) =>
      computer.deleteAccountComputer(userId, fake.provider),
    // A turn still running delegates to a new teammate (provisionTeammate)
    // after the bots were deleted...
    disconnectChatGPT: async () => {
      await addBot(user, "bot_del_late", "chat_del_late")
    },
    // ...and that teammate's turn uses the computer
    disconnectApps: async () => {
      await computer
        .ensureAccountComputer(user, fake.provider)
        .catch(() => undefined)
    },
    deleteUser: async (userId) => void calls.push(`clerk:${userId}`),
  })

  assert.deepEqual(
    await db.select().from(schema.bots).where(eq(schema.bots.userId, user)),
    []
  )
  assert.deepEqual(
    await db
      .select()
      .from(schema.computers)
      .where(eq(schema.computers.userId, user)),
    []
  )
  // Every computer made for the account was removed again
  assert.deepEqual(fake.removed().sort(), fake.created().sort())
  assert.equal(calls.at(-1), `clerk:${user}`)

  // And after deletion nothing can make one
  const later = fakeProvider()
  await assert.rejects(computer.ensureAccountComputer(user, later.provider))
  assert.deepEqual(later.calls, [])
})

test("P2: deleting the group chat holding the computer frees it for another chat", async () => {
  const user = "user_del_group"
  await addBot(user, "bot_dg_a", "chat_dg_a")
  await addBot(user, "bot_dg_b", "chat_dg_b")
  await db
    .insert(schema.chats)
    .values({ id: "group_dg", userId: user, kind: "group", name: "Team" })
  await db.insert(schema.chatMembers).values([
    { chatId: "group_dg", botId: "bot_dg_a" },
    { chatId: "group_dg", botId: "bot_dg_b" },
  ])
  // A long command's hold: without a release this lasts over ten minutes
  assert.deepEqual(
    await computer.acquireComputerLease(
      user,
      turn(10, "bot_dg_a", "group_dg"),
      { waitMs: 0, holdMs: 600_000 }
    ),
    { ok: true }
  )

  await chats.deleteGroupChat(user, "group_dg").catch(sentryLogOnly)

  assert.equal(await computer.computerInUseBy(user), null)
  assert.deepEqual(
    await computer.acquireComputerLease(
      user,
      turn(11, "bot_dg_b", "chat_dg_b"),
      { waitMs: 0 }
    ),
    { ok: true }
  )
  assert.equal((await computer.computerInUseBy(user))?.botId, "bot_dg_b")
})

test("P2: deleting the bot whose chat holds the computer frees it for another chat", async () => {
  const user = "user_del_bot"
  await addBot(user, "bot_db_a", "chat_db_a")
  await addBot(user, "bot_db_b", "chat_db_b")
  await computer.acquireComputerLease(user, turn(20, "bot_db_a", "chat_db_a"), {
    waitMs: 0,
  })

  await bots.deleteBot(user, "bot_db_a").catch(sentryLogOnly)

  assert.equal(await computer.computerInUseBy(user), null)
  assert.deepEqual(
    await computer.acquireComputerLease(
      user,
      turn(21, "bot_db_b", "chat_db_b"),
      { waitMs: 0 }
    ),
    { ok: true }
  )
})

test("P2: deleting another chat or another account's chat keeps the lease", async () => {
  const user = "user_del_keep"
  await addBot(user, "bot_dk_a", "chat_dk_a")
  await addBot(user, "bot_dk_b", "chat_dk_b")
  await db
    .insert(schema.chats)
    .values({ id: "group_dk", userId: user, kind: "group", name: "Team" })
  await db.insert(schema.chatMembers).values([
    { chatId: "group_dk", botId: "bot_dk_a" },
    { chatId: "group_dk", botId: "bot_dk_b" },
  ])
  await computer.acquireComputerLease(user, turn(30, "bot_dk_a", "chat_dk_a"), {
    waitMs: 0,
  })
  // Someone else can't touch it
  await assert.rejects(
    chats.deleteGroupChat("user_del_other", "group_dk"),
    /Chat not found/
  )
  await assert.rejects(
    bots.deleteBot("user_del_other", "bot_dk_a"),
    /Bot not found/
  )
  // The owner deleting a chat that doesn't hold it
  await chats.deleteGroupChat(user, "group_dk").catch(sentryLogOnly)
  await bots.deleteBot(user, "bot_dk_b").catch(sentryLogOnly)
  assert.equal((await computer.computerInUseBy(user))?.botId, "bot_dk_a")
})
