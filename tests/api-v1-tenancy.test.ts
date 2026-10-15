import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { after, before, test } from "node:test"
import { and, eq, inArray } from "drizzle-orm"

import { startTestDatabase } from "./helpers/test-db"

// Contract: account B can never read or change account A's data through the
// services /api/v1 calls with the session's userId. Runs against an
// in-memory Postgres with the real schema and queries. Every attempt below is
// rejected by the owner check before any provider (Trigger.dev, E2B,
// Composio) is reached, so none is configured.

const A = "user_a"
const B = "user_b"
const caller = (userId: string) => ({ userId, has: () => true })

let database: Awaited<ReturnType<typeof startTestDatabase>>
let db: typeof import("../db").db
let schema: typeof import("../db/schema")
let chats: typeof import("../services/chats")
let bots: typeof import("../services/bots")
let memory: typeof import("../services/memory")
let connectors: typeof import("../services/connectors")

const embedding = () => Array.from({ length: 1024 }, () => 0.01)

before(async () => {
  database = await startTestDatabase()
  ;({ db } = await import("../db"))
  schema = await import("../db/schema")
  chats = await import("../services/chats")
  bots = await import("../services/bots")
  memory = await import("../services/memory")
  connectors = await import("../services/connectors")

  await db.insert(schema.bots).values([
    { id: "bot_a1", userId: A, name: "Quill", job: "Writer" },
    { id: "bot_a2", userId: A, name: "Ledger", job: "Analyst" },
    { id: "bot_b1", userId: B, name: "Scout", job: "Researcher" },
    { id: "bot_b2", userId: B, name: "Atlas", job: "Planner" },
  ])
  await db.insert(schema.chats).values([
    { id: "chat_a1", userId: A, kind: "direct", lastMessagePreview: "hi" },
    { id: "group_a", userId: A, kind: "group", name: "A team" },
    { id: "chat_b1", userId: B, kind: "direct" },
    { id: "group_b", userId: B, kind: "group", name: "B team" },
  ])
  await db.insert(schema.chatMembers).values([
    { chatId: "chat_a1", botId: "bot_a1" },
    { chatId: "group_a", botId: "bot_a1" },
    { chatId: "group_a", botId: "bot_a2" },
    { chatId: "chat_b1", botId: "bot_b1" },
    { chatId: "group_b", botId: "bot_b1" },
    { chatId: "group_b", botId: "bot_b2" },
  ])
  await db.insert(schema.memories).values([
    {
      id: "mem_a",
      userId: A,
      kind: "preference",
      content: "A prefers short answers",
      embedding: embedding(),
      importance: 5,
      source: "explicit",
    },
    {
      id: "mem_b",
      userId: B,
      kind: "preference",
      content: "B likes tables",
      embedding: embedding(),
      importance: 5,
      source: "explicit",
    },
  ])
  await db.insert(schema.connectorAuthAttempts).values({
    state: "6f1c1c55-2f63-4b8b-9b0e-0a3c2f4f1e11",
    userId: A,
    accountId: "ca_a",
    toolkit: "gmail",
    returnUrl: "krafty://apps/connected",
    expiresAt: new Date(Date.now() + 60_000),
  })
})

after(async () => {
  await database?.stop()
})

const rejects = (promise: Promise<unknown>, message: RegExp) =>
  assert.rejects(promise, (error: Error) => {
    assert.match(error.message, message)
    return true
  })

test("B can't see A's chats, bots or memories", async () => {
  assert.equal(await chats.findChat(B, "chat_a1"), null)
  assert.equal(await chats.findChat(B, "group_a"), null)
  assert.deepEqual(
    (await chats.listChats(B)).map((chat) => chat.id).sort(),
    ["chat_b1", "group_b"]
  )
  assert.equal(await bots.findBot(B, "bot_a1"), null)
  assert.deepEqual(
    (await bots.listBots(B)).map((bot) => bot.id),
    ["bot_b1", "bot_b2"]
  )
  const overview = await memory.getMemoryOverview(B)
  assert.deepEqual(
    overview.memories.map((row) => row.id),
    ["mem_b"]
  )
  assert.deepEqual(
    overview.teammates.map((bot) => bot.id),
    ["bot_b1", "bot_b2"]
  )
})

test("B can't open, stream or check A's chat sessions", async () => {
  await rejects(
    chats.startChatSession(caller(B), { chatId: "chat_a1", clientData: {} }),
    /Chat not found/
  )
  await rejects(chats.mintChatAccessToken(caller(B), "chat_a1"), /Chat not found/)
  await rejects(chats.getChatTurnStatus(B, "chat_a1"), /Chat not found/)
  await rejects(chats.loadTranscript(B, "group_a"), /Chat not found/)
})

test("B can't start, pause or reset A's computer", async () => {
  await rejects(chats.getDesktopUrl(caller(B), "chat_a1"), /Chat not found/)
  await rejects(chats.pauseDesktop(B, "chat_a1"), /Chat not found/)
  await rejects(chats.resetDesktop(caller(B), "chat_a1"), /Chat not found/)
})

test("B can't rename, re-staff or delete A's group chat", async () => {
  await rejects(
    chats.updateGroupChat(B, "group_a", {
      name: "Mine now",
      botIds: ["bot_b1", "bot_b2"],
    }),
    /Chat not found/
  )
  // Nor pull A's bots into B's own group
  await rejects(
    chats.updateGroupChat(B, "group_b", {
      name: "B team",
      botIds: ["bot_b1", "bot_a1"],
    }),
    /Bot not found/
  )
  await rejects(chats.deleteGroupChat(B, "group_a"), /Chat not found/)
  await rejects(
    chats.reorderSidebarConversations(B, ["chat_b1", "chat_a1"]),
    /Conversations changed/
  )

  const group = await chats.findChat(A, "group_a")
  assert.equal(group?.name, "A team")
  assert.deepEqual(
    group?.bots.map((bot) => bot.id),
    ["bot_a1", "bot_a2"]
  )
  assert.equal(
    (await chats.findChat(B, "group_b"))?.bots.some((bot) => bot.userId === A),
    false
  )
})

test("B can't edit, pin, reorder or delete A's bots", async () => {
  await rejects(
    bots.updateBot(B, "bot_a1", { name: "Mine", job: "Spy", avatar: "x", instructions: null }),
    /Bot not found/
  )
  await rejects(bots.setBotPinned(B, "bot_a1", true), /Bot not found/)
  await rejects(bots.reorderPinnedBots(B, ["bot_a1"]), /Pinned bots changed/)
  await rejects(bots.deleteBot(B, "bot_a1"), /Bot not found/)

  const bot = await bots.findBot(A, "bot_a1")
  assert.equal(bot?.name, "Quill")
  assert.equal(bot?.pinnedAt, null)
  assert.ok(await chats.findChat(A, "chat_a1"))
})

test("B can't edit or delete A's memories, or scope a memory to A's bot", async () => {
  await rejects(
    memory.updateMemory(B, "mem_a", {
      content: "Rewritten",
      kind: "preference",
      botId: null,
      pinned: true,
    }),
    /Memory not found/
  )
  await rejects(
    memory.updateMemory(B, "mem_b", {
      content: "B likes tables",
      kind: "preference",
      botId: "bot_a1",
      pinned: false,
    }),
    /Teammate not found/
  )
  await rejects(memory.deleteMemory(B, "mem_a"), /Memory not found/)
  assert.deepEqual(
    (await memory.getMemoryOverview(A)).memories.map((row) => [row.id, row.pinned]),
    [["mem_a", false]]
  )
})

test("B can't complete or consume A's app connection attempt", async () => {
  const state = "6f1c1c55-2f63-4b8b-9b0e-0a3c2f4f1e11"
  assert.equal(
    await connectors.finishMobileAppConnection(B, {
      state,
      status: "success",
      accountId: "ca_a",
    }),
    false
  )
  // A's attempt is still there for A to finish
  assert.equal(
    await connectors.mobileConnectionReturnUrl(state),
    "krafty://apps/connected"
  )
})

// Every handler's identity comes from apiRoute (the Clerk session), so no
// route can act for a userId taken from the request
test("every /api/v1 handler runs through apiRoute", () => {
  const root = join(import.meta.dirname, "../app/api/v1")
  const routes: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (name === "route.ts") routes.push(path)
    }
  }
  walk(root)
  assert.ok(routes.length > 20)
  // The OAuth bridge has no session by design: it only redirects to the
  // return link stored with the attempt, and completing needs the app's token
  const public_ = new Set([join(root, "apps/connections/callback/route.ts")])
  for (const path of routes) {
    const source = readFileSync(path, "utf8")
    const handlers = [
      ...source.matchAll(/export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b[^\n]*/g),
    ]
    assert.ok(handlers.length > 0, path)
    for (const [line] of handlers) {
      if (public_.has(path)) continue
      assert.match(line, /= apiRoute(<[^>]+>)?\(/, `${path}: ${line}`)
    }
    assert.doesNotMatch(source, /userId\s*[:=]\s*(input|body|params|values)\b/, path)
  }
})

test("deleting B's account removes B's data and nothing of A's", async () => {
  const account = await import("../services/account")
  const calls: string[] = []
  const steps = (tier: string) => ({
    plan: async () => ({ tier }),
    // services/bots.deleteBot without its Sentry log, which needs Next's
    // bundling; its owner check is covered above
    deleteBot: async (userId: string, botId: string) => {
      await db.delete(schema.chats).where(
        and(
          eq(schema.chats.userId, userId),
          eq(schema.chats.kind, "direct"),
          inArray(
            schema.chats.id,
            db
              .select({ id: schema.chatMembers.chatId })
              .from(schema.chatMembers)
              .where(eq(schema.chatMembers.botId, botId))
          )
        )
      )
      await db
        .delete(schema.bots)
        .where(and(eq(schema.bots.id, botId), eq(schema.bots.userId, userId)))
    },
    disconnectChatGPT: async (userId: string) => calls.push(`chatgpt:${userId}`),
    disconnectApps: async (userId: string) => {
      calls.push(`apps:${userId}`)
    },
    deleteUser: async (userId: string) => calls.push(`clerk:${userId}`),
  })

  // A paid plan is cancelled on the web first; nothing is touched
  await rejects(account.deleteAccount(B, steps("paid")), /Cancel your paid plan/)
  assert.equal((await bots.listBots(B)).length, 2)
  assert.deepEqual(calls, [])

  await account.deleteAccount(B, steps("free"))
  assert.deepEqual(calls, [`chatgpt:${B}`, `apps:${B}`, `clerk:${B}`])
  assert.deepEqual(await bots.listBots(B), [])
  assert.deepEqual(await chats.listChats(B), [])
  assert.deepEqual((await memory.getMemoryOverview(B)).memories, [])

  assert.deepEqual(
    (await bots.listBots(A)).map((bot) => bot.id),
    ["bot_a1", "bot_a2"]
  )
  assert.deepEqual(
    (await chats.listChats(A)).map((chat) => chat.id).sort(),
    ["chat_a1", "group_a"]
  )
  assert.deepEqual(
    (await memory.getMemoryOverview(A)).memories.map((row) => row.id),
    ["mem_a"]
  )
  assert.ok(
    await connectors.mobileConnectionReturnUrl(
      "6f1c1c55-2f63-4b8b-9b0e-0a3c2f4f1e11"
    )
  )
})
