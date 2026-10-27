import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { eq } from "drizzle-orm"

import { startTestDatabase } from "./helpers/test-db"

// Contract: account B can never read, change, run or decide account A's
// routines, approvals, devices, activity or For you items. Runs on in-memory
// Postgres; every attempt is refused before any provider is reached. Plans are
// served from the account_plans cache, so Clerk is never called.

const A = "user_a"
const B = "user_b"
const FREE = "user_free"

let database: Awaited<ReturnType<typeof startTestDatabase>>
let db: typeof import("../db").db
let schema: typeof import("../db/schema")
let routines: typeof import("../services/routines")
let approvals: typeof import("../services/approvals")
let activity: typeof import("../services/activity")
let devices: typeof import("../services/devices")
let forYou: typeof import("../services/for-you")
let lib: typeof import("../lib/routines")
let approvalLib: typeof import("../lib/approvals")

const schedule = { kind: "interval" as const, hours: 4 }
const routineInput = (botId: string, requestId: string) => ({
  botId,
  title: "Inbox check",
  prompt: "Look for anything urgent",
  schedule,
  timezone: "UTC",
  requestId,
})

before(async () => {
  database = await startTestDatabase()
  ;({ db } = await import("../db"))
  schema = await import("../db/schema")
  routines = await import("../services/routines")
  approvals = await import("../services/approvals")
  activity = await import("../services/activity")
  devices = await import("../services/devices")
  forYou = await import("../services/for-you")
  lib = await import("../lib/routines")
  approvalLib = await import("../lib/approvals")

  const now = new Date()
  const period = {
    periodStart: new Date(now.getTime() - 86_400_000),
    periodEnd: new Date(now.getTime() + 30 * 86_400_000),
  }
  await db.insert(schema.accountPlans).values([
    { userId: A, tier: "paid", ...period, checkedAt: now },
    { userId: B, tier: "paid", ...period, checkedAt: now },
    { userId: FREE, tier: "free", checkedAt: now },
  ])
  await db.insert(schema.bots).values([
    { id: "bot_a1", userId: A, name: "Quill", job: "Writer" },
    { id: "bot_b1", userId: B, name: "Scout", job: "Researcher" },
    { id: "bot_free", userId: FREE, name: "Solo", job: "Helper" },
  ])
  await db.insert(schema.chats).values([
    { id: "chat_a1", userId: A, kind: "direct" },
    { id: "chat_b1", userId: B, kind: "direct" },
  ])
  await db.insert(schema.chatMembers).values([
    { chatId: "chat_a1", botId: "bot_a1" },
    { chatId: "chat_b1", botId: "bot_b1" },
  ])
})

after(async () => {
  await database?.stop()
})

test("routines are created in the owner's own chat, once per request", async () => {
  const first = await routines.createRoutine(A, routineInput("bot_a1", "req_1"))
  const retry = await routines.createRoutine(A, routineInput("bot_a1", "req_1"))
  assert.equal(first.id, retry.id)
  assert.equal(first.chatId, "chat_a1")
  assert.equal(first.description, "Every 4 hours")
  assert.ok(first.nextRunAt && first.nextRunAt > new Date())
  assert.equal("userId" in first, false)
})

test("B can't schedule A's bot or report into A's chat", async () => {
  await assert.rejects(
    routines.createRoutine(B, routineInput("bot_a1", "req_b")),
    /Bot not found/
  )
  await assert.rejects(
    lib.createRoutine(B, routineInput("bot_b1", "req_b2"), {
      chatId: "chat_a1",
    }),
    /Chat not found/
  )
})

test("B can't see, change, run or delete A's routine", async () => {
  const [mine] = await routines.listRoutines(A)
  assert.equal((await routines.listRoutines(B)).length, 0)
  await assert.rejects(
    routines.updateRoutine(B, mine.id, { enabled: false }),
    /Routine not found/
  )
  await assert.rejects(routines.runRoutineNow(B, mine.id), /Routine not found/)
  await assert.rejects(routines.deleteRoutine(B, mine.id), /Routine not found/)
  await assert.rejects(
    routines.listRoutineRuns(B, mine.id),
    /Routine not found/
  )
  assert.deepEqual(await routines.listRoutineRuns(A, mine.id), [])
  const [still] = await routines.listRoutines(A)
  assert.equal(still.enabled, true)
})

test("pausing clears the next run and resuming restarts the clock", async () => {
  const [mine] = await routines.listRoutines(A)
  const paused = await routines.updateRoutine(A, mine.id, { enabled: false })
  assert.equal(paused.nextRunAt, null)
  const resumed = await routines.updateRoutine(A, mine.id, { enabled: true })
  assert.ok(resumed.nextRunAt && resumed.nextRunAt > new Date())
})

test("the free plan gets one routine", async () => {
  await routines.createRoutine(FREE, routineInput("bot_free", "free_1"))
  await assert.rejects(
    routines.createRoutine(FREE, routineInput("bot_free", "free_2")),
    /free plan includes one routine/
  )
})

test("a due routine is claimed once and skipped, not run, when the allowance is spent", async () => {
  await db.insert(schema.usageEntries).values({
    userId: FREE,
    kind: "ai",
    amount: 2_000_000,
    idempotencyKey: "spent:free",
  })
  const [routine] = await routines.listRoutines(FREE)
  const due = new Date(Date.now() - 60_000)
  await db
    .update(schema.routines)
    .set({ nextRunAt: due })
    .where(eq(schema.routines.id, routine.id))

  const result = await lib.dispatchDueRoutines(new Date())
  assert.deepEqual(result, { started: 0, skipped: 1, failed: 0 })
  // A second cron run finds nothing due
  assert.deepEqual(await lib.dispatchDueRoutines(new Date()), {
    started: 0,
    skipped: 0,
    failed: 0,
  })
  const [after] = await routines.listRoutines(FREE)
  assert.equal(after.lastStatus, "skipped")
  assert.ok(after.nextRunAt && after.nextRunAt > new Date())
  const { events } = await activity.getActivity(FREE)
  assert.equal(events[0].kind, "routine_skipped")
  assert.equal((await activity.getActivity(A)).events.length, 0)
})

async function seedApproval(
  id: string,
  values: Partial<typeof schema.approvals.$inferInsert> = {}
) {
  await db.insert(schema.approvals).values({
    id,
    userId: A,
    botId: "bot_a1",
    chatId: "chat_a1",
    toolkit: "gmail",
    toolSlug: "GMAIL_SEND_EMAIL",
    accountId: "acct_a",
    arguments: { to: "sam@example.com" },
    summary: "Email Sam",
    expiresAt: new Date(Date.now() + 86_400_000),
    ...values,
  })
}

test("B can't read or decide A's approvals", async () => {
  await seedApproval("apr_a", { batchId: "run_a-0" })
  assert.equal((await approvals.listPendingApprovals(B)).length, 0)
  assert.equal((await approvals.listPendingApprovals(A)).length, 1)
  await assert.rejects(approvals.getApproval(B, "apr_a"), /Approval not found/)
  await assert.rejects(
    approvals.decideApproval(B, "apr_a", { decision: "approve" }),
    /Approval not found/
  )
  // A batch is found by its owner only, whatever its ID
  await assert.rejects(
    approvals.decideApprovalBatch(B, "run_a-0", { decision: "approve" }),
    /Approval not found/
  )
  const row = await approvals.getApproval(A, "apr_a")
  assert.equal(row.state, "pending")
  assert.equal(row.batchPending, 1)
  assert.equal("userId" in row, false)
})

test("a decided or expired request can't be decided again", async () => {
  await seedApproval("apr_done", { state: "approved", decidedAt: new Date() })
  await assert.rejects(
    approvals.decideApproval(A, "apr_done", { decision: "deny" }),
    /already decided/
  )
  await seedApproval("apr_old", { expiresAt: new Date(Date.now() - 1_000) })
  await assert.rejects(
    approvals.decideApproval(A, "apr_old", { decision: "approve" }),
    /expired/
  )
  assert.equal((await approvals.getApproval(A, "apr_old")).state, "expired")
})

test("only the asking bot, on its owner's account, can run an approved call, once", async () => {
  await seedApproval("apr_run", { state: "approved", decidedAt: new Date() })
  assert.equal(
    await approvalLib.claimApproval(B, "bot_a1", "apr_run"),
    undefined
  )
  assert.equal(
    await approvalLib.claimApproval(A, "bot_other", "apr_run"),
    undefined
  )
  // Only from the chat it was asked in
  assert.equal(
    await approvalLib.claimApproval(A, "bot_a1", "apr_run", "chat_other"),
    undefined
  )
  const claimed = await approvalLib.claimApproval(
    A,
    "bot_a1",
    "apr_run",
    "chat_a1"
  )
  assert.deepEqual(claimed?.arguments, { to: "sam@example.com" })
  assert.equal(
    await approvalLib.claimApproval(A, "bot_a1", "apr_run"),
    undefined
  )
  // A pending request can't be claimed before its owner decides
  assert.equal(await approvalLib.claimApproval(A, "bot_a1", "apr_a"), undefined)
})

test("a push token follows the account that last signed in on the phone", async () => {
  const token = "ExponentPushToken[shared-phone]"
  await devices.registerDevice(A, { token, platform: "ios" })
  await devices.registerDevice(B, { token, platform: "ios" })
  await devices.removeDevice(A, token)
  const rows = await db
    .select()
    .from(schema.pushDevices)
    .where(eq(schema.pushDevices.token, token))
  assert.equal(rows[0]?.userId, B)
  await assert.rejects(
    devices.registerDevice(A, { token: "not-a-token", platform: "ios" }),
    /Invalid push token/
  )
})

test("B can't act on A's For you items", async () => {
  await db.insert(schema.forYouItems).values({
    id: "fy_a",
    userId: A,
    botId: "bot_a1",
    fingerprint: "memory:m1",
    title: "Reply to Sam",
    reason: "Asked yesterday",
    prompt: "Draft a reply",
    category: "reply",
    urgency: "today",
    score: 0.9,
    sourceId: "m1",
    sourceQuote: "Reply to Sam",
    sourceLabel: "Memory",
    expiresAt: new Date(Date.now() + 86_400_000),
  })
  await assert.rejects(
    forYou.updateForYouItem(B, "fy_a", { type: "snooze" }),
    /no longer available/
  )
  await assert.rejects(
    forYou.updateForYouItem(B, "fy_a", { type: "hide_app" }),
    /no longer available/
  )
  await assert.rejects(forYou.startForYouItem(B, "fy_a"), /no longer available/)
  // Hiding an app is per account and only clears that account's cards
  await db.insert(schema.forYouItems).values({
    id: "fy_a_gmail",
    userId: A,
    botId: "bot_a1",
    fingerprint: "gmail:m9",
    title: "Reply to Dana",
    reason: "Asked yesterday",
    prompt: "Draft a reply",
    category: "reply",
    urgency: "today",
    score: 0.8,
    toolkit: "gmail",
    sourceId: "m9",
    sourceQuote: "Reply to Dana",
    sourceLabel: "Email from Dana",
    expiresAt: new Date(Date.now() + 86_400_000),
  })
  await forYou.setAppSuggestions(B, "gmail", false)
  assert.deepEqual((await forYou.getForYou(A)).hiddenApps, [])
  assert.ok(
    (await forYou.getForYou(A)).items.some((entry) => entry.id === "fy_a_gmail")
  )
  assert.deepEqual((await forYou.getForYou(B)).hiddenApps, ["gmail"])
  await forYou.setAppSuggestions(B, "gmail", true)
  assert.deepEqual((await forYou.getForYou(B)).hiddenApps, [])
  await db
    .delete(schema.forYouItems)
    .where(eq(schema.forYouItems.id, "fy_a_gmail"))
  const [item] = await db
    .select()
    .from(schema.forYouItems)
    .where(eq(schema.forYouItems.id, "fy_a"))
  assert.equal(item.state, "new")
})

test("a bot can only change its own routines", async () => {
  await db
    .insert(schema.bots)
    .values({ id: "bot_a2", userId: A, name: "Ledger", job: "Analyst" })
  const [mine] = await routines.listRoutines(A)
  await assert.rejects(
    lib.updateRoutine(A, mine.id, { enabled: false }, { botId: "bot_a2" }),
    /Routine not found/
  )
  await assert.rejects(
    lib.deleteRoutine(A, mine.id, { botId: "bot_a2" }),
    /Routine not found/
  )
  assert.equal(
    (
      await lib.updateRoutine(
        A,
        mine.id,
        { title: "Renamed" },
        { botId: "bot_a1" }
      )
    ).title,
    "Renamed"
  )
})

test("an interval routine keeps its cadence instead of drifting with cron latency", async () => {
  const [mine] = await routines.listRoutines(A)
  const due = new Date(Date.UTC(2026, 9, 16, 10, 0, 0))
  await db
    .update(schema.routines)
    .set({ nextRunAt: due, enabled: true })
    .where(eq(schema.routines.id, mine.id))
  // Exhausted allowance: claimed and skipped without reaching Trigger.dev
  await db.insert(schema.usageEntries).values({
    userId: A,
    kind: "ai",
    amount: 20_000_000,
    idempotencyKey: "spent:a",
  })
  await lib.dispatchDueRoutines(new Date(due.getTime() + 45_000))
  const [after] = await routines.listRoutines(A)
  assert.equal(after.nextRunAt?.toISOString(), "2026-10-16T14:00:00.000Z")
})
