import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { after, before, test } from "node:test"
import { and, eq, inArray } from "drizzle-orm"
import { NextRequest } from "next/server"

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
let reports: typeof import("../services/ai-content-reports")

const embedding = () => Array.from({ length: 1024 }, () => 0.01)

before(async () => {
  database = await startTestDatabase()
  ;({ db } = await import("../db"))
  schema = await import("../db/schema")
  chats = await import("../services/chats")
  bots = await import("../services/bots")
  memory = await import("../services/memory")
  connectors = await import("../services/connectors")
  reports = await import("../services/ai-content-reports")

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
  assert.deepEqual((await chats.listChats(B)).map((chat) => chat.id).sort(), [
    "chat_b1",
    "group_b",
  ])
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
  await rejects(
    chats.mintChatAccessToken(caller(B), "chat_a1"),
    /Chat not found/
  )
  await rejects(chats.getChatTurnStatus(B, "chat_a1"), /Chat not found/)
  await rejects(chats.loadTranscript(B, "group_a"), /Chat not found/)
})

test("B can't start, pause or reset A's computer", async () => {
  await rejects(chats.getDesktopUrl(caller(B), "chat_a1"), /Chat not found/)
  await rejects(chats.pauseDesktop(B, "chat_a1"), /Chat not found/)
  await rejects(chats.resetDesktop(caller(B), "chat_a1"), /Chat not found/)
  // The account computer is shown in group chats too, still owner-scoped
  await rejects(chats.getDesktopUrl(caller(B), "group_a"), /Chat not found/)
  await rejects(chats.pauseDesktop(B, "group_a"), /Chat not found/)
  await rejects(chats.resetDesktop(caller(B), "group_a"), /Chat not found/)
  await rejects(chats.getComputerInUse(B, "chat_a1"), /Chat not found/)
  await rejects(chats.getComputerInUse(B, "group_a"), /Chat not found/)
})

test("AI report endpoint rejects cookies without a bearer token", async () => {
  const { POST } =
    await import("../app/api/v1/chats/[chatId]/messages/[messageId]/report/route")
  const response = await POST(
    new NextRequest(
      "https://kraftybot.app/api/v1/chats/chat_a1/messages/reply/report",
      {
        method: "POST",
        headers: {
          cookie: "__session=untrusted",
          "content-type": "application/json",
        },
        body: JSON.stringify({ reason: "unsafe" }),
      }
    ),
    { params: Promise.resolve({ chatId: "chat_a1", messageId: "reply" }) }
  )
  assert.equal(response.status, 401)
  assert.equal((await response.json()).error.code, "unauthorized")
  assert.equal(response.headers.get("cache-control"), "private, no-store")
})

test("B can't report A's assistant message or reach its provider transcript", async () => {
  await rejects(
    reports.reportAIContent(
      B,
      "chat_a1",
      "reply_a",
      { reason: "unsafe" },
      {
        loadTranscript: async () => {
          throw new Error("Provider must not be reached")
        },
      }
    ),
    /Chat not found/
  )
  assert.equal((await db.select().from(schema.aiContentReports)).length, 0)
})

test("AI reports validate input, verify assistant messages, deduplicate and cascade", async () => {
  await db.insert(schema.chats).values({ id: "chat_report", userId: A })
  let loads = 0
  const dependencies = {
    loadTranscript: async (userId: string, chatId: string) => {
      assert.equal(userId, A)
      assert.equal(chatId, "chat_report")
      loads++
      return {
        messages: [
          {
            id: "reply",
            role: "assistant",
            parts: [
              { type: "text", text: "Reported response" },
              { type: "tool-bash", input: { secret: "not captured" } },
            ],
          },
          {
            id: "question",
            role: "user",
            parts: [{ type: "text", text: "User text" }],
          },
        ],
      }
    },
  }
  for (const messageId of ["question", "missing"])
    await rejects(
      reports.reportAIContent(
        A,
        "chat_report",
        messageId,
        { reason: "unsafe" },
        dependencies
      ),
      /Message not found/
    )
  await rejects(
    reports.reportAIContent(
      A,
      "chat_report",
      "reply",
      { reason: "unsafe" },
      {
        loadTranscript: async () => {
          throw new Error("Provider unavailable")
        },
      }
    ),
    /Provider unavailable/
  )
  assert.equal((await db.select().from(schema.aiContentReports)).length, 0)
  for (const input of [
    { reason: "unknown" },
    { reason: "unsafe", details: "x".repeat(1001) },
    { reason: "unsafe", userId: B },
  ])
    assert.equal(schema.aiContentReportSchema.safeParse(input).success, false)
  assert.equal(
    schema.aiContentReportSchema.safeParse({
      reason: "other",
      details: "x".repeat(1000),
    }).success,
    true
  )
  const results = await Promise.all([
    reports.reportAIContent(
      A,
      "chat_report",
      "reply",
      { reason: "unsafe", details: " Please review " },
      dependencies
    ),
    reports.reportAIContent(
      A,
      "chat_report",
      "reply",
      { reason: "unsafe", details: " Please review " },
      dependencies
    ),
  ])
  assert.deepEqual(results.map((result) => result.created).sort(), [
    false,
    true,
  ])
  const [saved] = await db
    .select()
    .from(schema.aiContentReports)
    .where(eq(schema.aiContentReports.chatId, "chat_report"))
  assert.equal(saved.userId, A)
  assert.equal(saved.messageText, "Reported response")
  assert.equal(saved.details, "Please review")
  assert.equal(saved.reason, "unsafe")
  const previousLoads = loads
  assert.deepEqual(
    await reports.reportAIContent(
      A,
      "chat_report",
      "reply",
      { reason: "other" },
      {
        loadTranscript: async () => {
          throw new Error("Provider unavailable")
        },
      }
    ),
    { reported: true, created: false }
  )
  assert.equal(loads, previousLoads)
  await db
    .delete(schema.chats)
    .where(and(eq(schema.chats.id, "chat_report"), eq(schema.chats.userId, A)))
  assert.equal((await db.select().from(schema.aiContentReports)).length, 0)
})

test("AI reports store whitespace-only optional details as null", async () => {
  const chatId = "chat_report_blank"
  await db.insert(schema.chats).values({ id: chatId, userId: A })
  await reports.reportAIContent(
    A,
    chatId,
    "reply",
    { reason: "other", details: " \t\n " },
    {
      loadTranscript: async () => ({
        messages: [
          {
            id: "reply",
            role: "assistant",
            parts: [{ type: "text", text: "Response" }],
          },
        ],
      }),
    }
  )
  const [saved] = await db
    .select()
    .from(schema.aiContentReports)
    .where(eq(schema.aiContentReports.chatId, chatId))
  assert.equal(saved.details, null)
  await db
    .delete(schema.chats)
    .where(and(eq(schema.chats.id, chatId), eq(schema.chats.userId, A)))
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
    bots.updateBot(B, "bot_a1", {
      name: "Mine",
      job: "Spy",
      avatar: "x",
      instructions: null,
    }),
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
    (await memory.getMemoryOverview(A)).memories.map((row) => [
      row.id,
      row.pinned,
    ]),
    [["mem_a", false]]
  )
})

test("B can't complete or consume A's app connection attempt", async () => {
  const state = "6f1c1c55-2f63-4b8b-9b0e-0a3c2f4f1e11"
  assert.deepEqual(
    await connectors.finishMobileAppConnection(B, {
      state,
      status: "success",
      accountId: "ca_a",
    }),
    { connected: false }
  )
  // A's attempt is still there for A to finish
  assert.equal(
    await connectors.mobileConnectionReturnUrl(state),
    "krafty://apps/connected"
  )
})

test("B can't finish a connection with A's account ID, even one the provider reports active", async () => {
  const state = "6f1c1c55-2f63-4b8b-9b0e-0a3c2f4f1e22"
  await db.insert(schema.connectorAuthAttempts).values({
    state,
    userId: B,
    accountId: "ca_b",
    toolkit: "gmail",
    returnUrl: "krafty://apps/connected",
    expiresAt: new Date(Date.now() + 60_000),
  })
  const asked: string[] = []
  assert.deepEqual(
    await connectors.finishMobileAppConnection(
      B,
      { state, status: "success", accountId: "ca_a" },
      {
        loadAccounts: async (owner) => {
          asked.push(owner)
          return {
            items: [
              {
                id: "ca_a",
                status: "ACTIVE",
                isDisabled: false,
                toolkit: { slug: "gmail" },
              },
            ],
          }
        },
      }
    ),
    { connected: false }
  )
  // The attempt's own account ID decides, and the lookup was B's alone
  assert.equal(asked.length, 0)
})

test("B can't start a connection from A's chat or with a bot outside the chat", async () => {
  const origin = "https://example.test"
  const input = { slug: "gmail", returnUrl: "krafty://apps/connected" }
  // Rejected before the provider is reached
  await rejects(
    connectors.beginMobileAppConnection(
      B,
      { ...input, chatId: "chat_a1", botId: "bot_a1", questionId: "q" },
      origin
    ),
    /Chat not found/
  )
  await rejects(
    connectors.beginMobileAppConnection(
      B,
      { ...input, chatId: "group_a" },
      origin
    ),
    /Chat not found/
  )
  // B's own chat, but a bot that isn't a member (A's bot, and B's other bot)
  for (const botId of ["bot_a1", "bot_b2"])
    await rejects(
      connectors.beginMobileAppConnection(
        B,
        { ...input, chatId: "chat_b1", botId },
        origin
      ),
      /Chat not found/
    )
  await rejects(
    connectors.beginAppConnection(B, "gmail", origin, {
      chatId: "chat_a1",
      questionId: "q",
      botId: "bot_a1",
    }),
    /Chat not found/
  )
  // questionId or botId without chatId is a validation error
  await rejects(
    connectors.beginMobileAppConnection(
      B,
      { ...input, questionId: "q" },
      origin
    ),
    /chatId/
  )
})

// Every handler's identity comes from apiRoute (the Clerk session), so no
// route can act for a userId taken from the request
test("B can't list or remove A's Always allow rules", async () => {
  const service = await import("../services/approvals")
  await db.insert(schema.approvalRules).values({
    userId: A,
    botId: "bot_a1",
    toolSlug: "NOTION_UPDATE_PAGE",
    accountId: "ca_a",
  })
  assert.deepEqual(await service.listApprovalRules(B), [])
  await assert.rejects(
    service.revokeApprovalRule(B, {
      botId: "bot_a1",
      toolSlug: "NOTION_UPDATE_PAGE",
    }),
    /Rule not found/
  )
  assert.equal((await service.listApprovalRules(A)).length, 1)
  await service.revokeApprovalRule(A, {
    botId: "bot_a1",
    toolSlug: "NOTION_UPDATE_PAGE",
  })
  assert.equal((await service.listApprovalRules(A)).length, 0)
})

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
      ...source.matchAll(
        /export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b[^\n]*/g
      ),
    ]
    assert.ok(handlers.length > 0, path)
    for (const [line] of handlers) {
      if (public_.has(path)) continue
      assert.match(line, /= apiRoute(<[^>]+>)?\(/, `${path}: ${line}`)
    }
    assert.doesNotMatch(
      source,
      /userId\s*[:=]\s*(input|body|params|values)\b/,
      path
    )
  }
})

test("deleting B's account removes B's data and nothing of A's", async () => {
  const account = await import("../services/account")
  const calls: string[] = []
  // Kept apart from `calls`, whose order the assertions below check
  const appleCalls: string[] = []
  const steps = () => ({
    cancelSubscriptions: async (userId: string) => {
      calls.push(`billing:${userId}`)
    },
    revokeApple: async (userId: string) => {
      appleCalls.push(userId)
      return "none" as const
    },
    closeChat: async (chatId: string) => {
      calls.push(`close:${chatId}`)
    },
    // services/bots.deleteBot without its Sentry log, which needs Next's
    // bundling; its owner check is covered above
    deleteBot: async (userId: string, botId: string) => {
      await db
        .delete(schema.chats)
        .where(
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
    // lib/account-computer.deleteAccountComputer without the provider
    deleteComputer: async (userId: string) => {
      calls.push(`computer:${userId}`)
      await db
        .delete(schema.computers)
        .where(eq(schema.computers.userId, userId))
    },
    disconnectChatGPT: async (userId: string) =>
      calls.push(`chatgpt:${userId}`),
    disconnectApps: async (userId: string) => {
      calls.push(`apps:${userId}`)
    },
    deleteUser: async (userId: string) => calls.push(`clerk:${userId}`),
  })

  await db.insert(schema.forYouScans).values([
    { userId: A, status: "done" },
    { userId: B, status: "done" },
  ])
  await db
    .insert(schema.computers)
    .values([{ userId: A }, { userId: B }])
    .onConflictDoNothing()
  await db.insert(schema.appleSignInGrants).values(
    [A, B].map((userId) => ({
      userId,
      clientId: "app.kraftybot.mobile",
      subject: `apple_${userId}`,
      refreshToken: "v1.encrypted",
    }))
  )
  await db.insert(schema.aiContentReports).values([
    {
      userId: A,
      chatId: "chat_a1",
      messageId: "reply_a",
      reason: "unsafe",
      messageText: "A's reported text",
    },
    {
      userId: B,
      chatId: "chat_b1",
      messageId: "reply_b",
      reason: "unsafe",
      messageText: "B's reported text",
    },
  ])

  // A billing outage must not destroy the account or any workspace data.
  await rejects(
    account.deleteAccount(B, {
      ...steps(),
      cancelSubscriptions: async () => {
        throw new Error("billing unavailable")
      },
    }),
    /billing unavailable/
  )
  assert.equal((await bots.listBots(B)).length, 2)
  assert.deepEqual(calls, [])

  // A session failure keeps chat IDs available for the next cleanup attempt.
  await rejects(
    account.deleteAccount(B, {
      ...steps(),
      cancelSubscriptions: async () => {},
      closeChat: async () => {
        throw new Error("session unavailable")
      },
    }),
    /session unavailable/
  )
  assert.equal((await bots.listBots(B)).length, 2)
  assert.equal((await chats.listChats(B)).length, 2)

  assert.deepEqual(await account.deleteAccount(B, steps()), {
    appleSignIn: "none",
  })
  assert.equal(calls[0], `billing:${B}`)
  assert.deepEqual(calls.slice(1, 3).sort(), ["close:chat_b1", "close:group_b"])
  // The computer goes last, once no bot is left to bring it back
  assert.deepEqual(calls.slice(3), [
    `chatgpt:${B}`,
    `apps:${B}`,
    `computer:${B}`,
    `clerk:${B}`,
  ])
  // Each provider attempt revokes first; successful Clerk deletion gets a fresh sweep.
  assert.deepEqual(appleCalls, [B, B, B])
  assert.deepEqual(
    (await db.select().from(schema.appleSignInGrants)).map((row) => row.userId),
    [A]
  )
  assert.deepEqual(await bots.listBots(B), [])
  assert.deepEqual(await chats.listChats(B), [])
  assert.deepEqual(
    (
      await db
        .select({ userId: schema.aiContentReports.userId })
        .from(schema.aiContentReports)
    ).map((row) => row.userId),
    [A]
  )
  assert.deepEqual((await memory.getMemoryOverview(B)).memories, [])
  assert.deepEqual(
    (await db.select().from(schema.forYouScans)).map((row) => row.userId),
    [A]
  )
  assert.deepEqual(
    (await db.select().from(schema.computers)).map((row) => row.userId),
    [A]
  )

  assert.deepEqual(
    (await bots.listBots(A)).map((bot) => bot.id),
    ["bot_a1", "bot_a2"]
  )
  assert.deepEqual((await chats.listChats(A)).map((chat) => chat.id).sort(), [
    "chat_a1",
    "group_a",
  ])
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

test("email cards are owner-scoped and saved edits are the only arguments claimed once", async () => {
  const service = await import("../services/approvals")
  const approvalLib = await import("../lib/approvals")
  const { stageEmailDraft, publicEmailDraft, emailExecutionArguments } =
    await import("../lib/email-draft")
  const { emailTool, emailInput } = await import("./helpers/email-draft")
  const input = stageEmailDraft(emailTool, emailInput)!
  await db.insert(schema.approvals).values({
    id: "email_a",
    userId: A,
    botId: "bot_a1",
    chatId: "chat_a1",
    toolkit: "gmail",
    toolSlug: emailTool.slug,
    accountId: "gmail_a",
    arguments: input,
    summary: "Reply to Ayesha",
    expiresAt: new Date(Date.now() + 60_000),
  })
  const draft = publicEmailDraft(input)!
  await rejects(service.getApproval(B, "email_a"), /Approval not found/)
  for (const action of ["save", "send"] as const)
    await rejects(
      service.actOnEmailDraft(B, "email_a", {
        action,
        revision: 0,
        content: draft,
      }),
      /Approval not found/
    )
  await rejects(
    service.actOnEmailDraft(B, "email_a", { action: "discard" }),
    /Approval not found/
  )
  const saved = await service.actOnEmailDraft(A, "email_a", {
    action: "save",
    revision: 0,
    content: { ...draft, body: "Reviewed by Drew" },
  })
  assert.equal(saved.approval.emailDraft?.body, "Reviewed by Drew")
  await rejects(
    service.actOnEmailDraft(A, "email_a", {
      action: "save",
      revision: 0,
      content: draft,
    }),
    /changed on another device/
  )
  const sent = await service.actOnEmailDraft(
    A,
    "email_a",
    {
      action: "send",
      revision: 1,
      content: { ...draft, body: "Final reviewed reply" },
    },
    {
      dispatch: async (_chatId, message) => {
        assert.match(message.text, /runApprovedAction/)
        assert.match(message.text, /email_a/)
      },
    }
  )
  assert.equal(sent.approval.state, "approved")
  assert.equal(sent.approval.emailDraft?.body, "Final reviewed reply")
  await rejects(
    service.actOnEmailDraft(
      A,
      "email_a",
      { action: "send", revision: 1, content: draft },
      {
        dispatch: async () => {
          assert.fail("Duplicate must never dispatch")
        },
      }
    ),
    /changed on another device/
  )
  await db.insert(schema.approvals).values({
    id: "discard_email",
    userId: A,
    botId: "bot_a1",
    chatId: "chat_a1",
    toolkit: "gmail",
    toolSlug: emailTool.slug,
    accountId: "gmail_a",
    arguments: input,
    summary: "Draft to discard",
    expiresAt: new Date(Date.now() + 60_000),
  })
  const discarded = await service.actOnEmailDraft(
    A,
    "discard_email",
    { action: "discard" },
    {
      dispatch: async (_chatId, message) => {
        assert.match(message.text, /declined/)
      },
    }
  )
  assert.equal(discarded.approval.state, "denied")
  assert.equal(
    await approvalLib.claimApproval(A, "bot_a1", "discard_email"),
    undefined
  )
  assert.equal(
    await approvalLib.claimApproval(B, "bot_a1", "email_a"),
    undefined
  )
  const claimed = await approvalLib.claimApproval(A, "bot_a1", "email_a")
  assert.equal(
    emailExecutionArguments(claimed!.arguments).body,
    "Final reviewed reply"
  )
  assert.equal(
    emailExecutionArguments(claimed!.arguments).thread_id,
    "thread_verified"
  )
  assert.equal(
    await approvalLib.claimApproval(A, "bot_a1", "email_a"),
    undefined
  )
  await rejects(
    service.actOnEmailDraft(A, "email_a", {
      action: "save",
      revision: 1,
      content: draft,
    }),
    /already decided/
  )
})
