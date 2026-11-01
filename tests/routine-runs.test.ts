import assert from "node:assert/strict"
import { after, before, mock, test } from "node:test"
import { and, eq, like } from "drizzle-orm"

import { startTestDatabase } from "./helpers/test-db"

// A routine's life on in-memory Postgres: created from chat-style input,
// claimed when due, dispatched through a fake postChatMessage, and given the
// outcome the turn reports. Nothing reaches Trigger.dev, Clerk or a model.
// Plans come from the account_plans cache.

const OWNER = "user_owner"
const OTHER = "user_other"
const FREE = "user_free"
const BIG = "user_big"
// Runs that die mid-turn (#34), on an account of their own so the sweep's
// pushes and activity can be counted exactly
const STUCK = "user_stuck"

let database: Awaited<ReturnType<typeof startTestDatabase>>
let db: typeof import("../db").db
let schema: typeof import("../db/schema")
let lib: typeof import("../lib/routines")
let policy: typeof import("../lib/routine-policy")

type Deps = import("../lib/routines").RoutineRunDeps

function fakeDeps(options: { skip?: string; fail?: boolean } = {}) {
  const posts: { chatId: string; id: string; text: string; botId?: string }[] =
    []
  const checked: { userId: string; botId: string }[] = []
  const deps: Deps = {
    post: async (chatId, message, opts) => {
      if (options.fail) throw new Error("trigger.dev is down")
      posts.push({
        chatId,
        id: message.id,
        text: message.text,
        botId: opts?.botId,
      })
    },
    check: async (routine) => {
      checked.push({ userId: routine.userId, botId: routine.botId })
      return options.skip
    },
  }
  return { deps, posts, checked }
}

const input = (
  botId: string,
  requestId: string,
  schedule: Record<string, unknown> = { kind: "interval", hours: 4 },
  timezone = "UTC"
) =>
  ({
    botId,
    title: "Inbox check",
    prompt: "Look for anything urgent",
    schedule,
    timezone,
    requestId,
  }) as import("../db/schema").RoutineInsert

const row = async (id: string) => {
  const [found] = await db
    .select()
    .from(schema.routines)
    .where(eq(schema.routines.id, id))
  return found
}

async function dueRoutine(
  userId: string,
  botId: string,
  requestId: string,
  agoMs: number,
  schedule?: Record<string, unknown>
) {
  const created = await lib.createRoutine(
    userId,
    input(botId, requestId, schedule)
  )
  const due = new Date(Math.floor((Date.now() - agoMs) / 1000) * 1000)
  await db
    .update(schema.routines)
    .set({ nextRunAt: due })
    .where(eq(schema.routines.id, created.id))
  return { id: created.id, due }
}

// Routines run by hand with runRoutine stay due; park them so later tests
// that claim from the cron see only their own
const park = (id: string) =>
  db
    .update(schema.routines)
    .set({ nextRunAt: new Date(Date.now() + 86_400_000) })
    .where(eq(schema.routines.id, id))

before(async () => {
  database = await startTestDatabase()
  ;({ db } = await import("../db"))
  schema = await import("../db/schema")
  lib = await import("../lib/routines")
  policy = await import("../lib/routine-policy")

  const now = new Date()
  const period = {
    periodStart: new Date(now.getTime() - 86_400_000),
    periodEnd: new Date(now.getTime() + 30 * 86_400_000),
  }
  await db.insert(schema.accountPlans).values([
    { userId: OWNER, tier: "paid", ...period, checkedAt: now },
    { userId: OTHER, tier: "paid", ...period, checkedAt: now },
    { userId: BIG, tier: "paid", ...period, checkedAt: now },
    { userId: FREE, tier: "free", checkedAt: now },
    { userId: STUCK, tier: "paid", ...period, checkedAt: now },
  ])
  await db.insert(schema.bots).values([
    { id: "bot_owner", userId: OWNER, name: "Quill", job: "Writer" },
    { id: "bot_owner2", userId: OWNER, name: "Ledger", job: "Analyst" },
    { id: "bot_other", userId: OTHER, name: "Scout", job: "Researcher" },
    { id: "bot_big", userId: BIG, name: "Atlas", job: "Planner" },
    { id: "bot_free", userId: FREE, name: "Solo", job: "Helper" },
    { id: "bot_stuck", userId: STUCK, name: "Relay", job: "Runner" },
  ])
  await db.insert(schema.chats).values([
    { id: "chat_owner", userId: OWNER, kind: "direct" },
    { id: "chat_owner2", userId: OWNER, kind: "direct" },
    { id: "chat_other", userId: OTHER, kind: "direct" },
    { id: "chat_big", userId: BIG, kind: "direct" },
    { id: "chat_free", userId: FREE, kind: "direct" },
    { id: "chat_stuck", userId: STUCK, kind: "direct" },
  ])
  await db.insert(schema.chatMembers).values([
    { chatId: "chat_owner", botId: "bot_owner" },
    { chatId: "chat_owner2", botId: "bot_owner2" },
    { chatId: "chat_other", botId: "bot_other" },
    { chatId: "chat_big", botId: "bot_big" },
    { chatId: "chat_free", botId: "bot_free" },
    { chatId: "chat_stuck", botId: "bot_stuck" },
  ])
})

after(async () => {
  await database?.stop()
})

test("a one-off given as a local wall-clock time is stored as the instant it means", async () => {
  const created = await lib.createRoutine(
    OWNER,
    input(
      "bot_owner",
      "once_local",
      { kind: "once", at: "2099-03-01T09:00" },
      "America/New_York"
    )
  )
  // 09:00 EST on 1 March
  assert.deepEqual(created.schedule, {
    kind: "once",
    at: "2099-03-01T14:00:00.000Z",
  })
  assert.equal(created.nextRunAt?.toISOString(), "2099-03-01T14:00:00.000Z")
  assert.equal(created.description, "Once, Mar 1, 9:00 AM")
})

test("the offset form old clients send is still accepted", async () => {
  const created = await lib.createRoutine(
    OWNER,
    input(
      "bot_owner",
      "once_offset",
      { kind: "once", at: "2099-03-01T09:00:00-05:00" },
      "Asia/Tokyo"
    )
  )
  assert.equal(created.nextRunAt?.toISOString(), "2099-03-01T14:00:00.000Z")
})

test("a one-off in the past is refused, whichever form it comes in", async () => {
  for (const at of ["2020-01-01T09:00", "2020-01-01T09:00:00Z"])
    await assert.rejects(
      lib.createRoutine(
        OWNER,
        input("bot_owner", `past_${at}`, { kind: "once", at }, "UTC")
      ),
      /Pick a time in the future/
    )
})

test("changing a schedule keeps the owner's timezone and restarts the clock", async () => {
  const created = await lib.createRoutine(
    OWNER,
    input(
      "bot_owner",
      "to_weekdays",
      { kind: "daily", time: "08:00", days: [0, 1, 2, 3, 4, 5, 6] },
      "America/Chicago"
    )
  )
  const updated = await lib.updateRoutine(OWNER, created.id, {
    schedule: { kind: "daily", time: "08:00", days: [1, 2, 3, 4, 5] },
  })
  assert.equal(updated.description, "Weekdays at 8am")
  assert.equal(updated.timezone, "America/Chicago")
  const next = updated.nextRunAt!
  assert.ok(next > new Date())
  const local = policy.zonedParts(next, "America/Chicago")
  assert.equal(local.hour, 8)
  assert.ok(local.weekday >= 1 && local.weekday <= 5)

  // A wall-clock one-off on update is read in the (possibly new) timezone
  const moved = await lib.updateRoutine(OWNER, created.id, {
    schedule: { kind: "once", at: "2099-06-01T07:30" },
    timezone: "Europe/London",
  })
  assert.equal(moved.nextRunAt?.toISOString(), "2099-06-01T06:30:00.000Z")
})

test("a due routine is claimed, posted into its own chat as its own bot, then reported on", async () => {
  const { id, due } = await dueRoutine(
    "user_owner",
    "bot_owner",
    "run_1",
    60_000
  )
  const { deps, posts, checked } = fakeDeps()

  const result = await lib.dispatchDueRoutines(new Date(), 200, deps)
  assert.deepEqual(result, { started: 1, skipped: 0, failed: 0 })

  // The run is the routine's bot, in the routine's chat, on the owner's account
  const messageId = policy.routineRunMessageId(id, due)
  assert.equal(posts.length, 1)
  assert.equal(posts[0].id, messageId)
  assert.equal(posts[0].chatId, "chat_owner")
  assert.equal(posts[0].botId, "bot_owner")
  assert.match(posts[0].text, /Scheduled routine "Inbox check"/)
  assert.match(posts[0].text, /Look for anything urgent/)
  assert.deepEqual(checked, [{ userId: OWNER, botId: "bot_owner" }])
  assert.equal(policy.unattendedOrigin(messageId), "routine")

  const started = await row(id)
  assert.equal(started.lastStatus, "started")
  assert.equal(started.lastRunAt?.getTime(), due.getTime())
  // Counted from when it was due, so the cadence doesn't drift
  assert.equal(started.nextRunAt?.getTime(), due.getTime() + 4 * 3_600_000)

  const done = await lib.recordRoutineRunOutcome(OWNER, messageId, {
    status: "completed",
  })
  assert.deepEqual(done, { updated: true })
  const finished = await row(id)
  assert.equal(finished.lastStatus, "completed")
  assert.equal(finished.lastError, null)
  // Reporting twice changes nothing
  assert.deepEqual(
    await lib.recordRoutineRunOutcome(OWNER, messageId, {
      status: "completed",
    }),
    { updated: true }
  )
  assert.equal((await row(id)).lastStatus, "completed")
})

test("a second cron run, or two at once, never posts the same routine twice", async () => {
  const { id, due } = await dueRoutine(OWNER, "bot_owner2", "run_twice", 30_000)
  const { deps, posts } = fakeDeps()
  const now = new Date()
  const both = await Promise.all([
    lib.dispatchDueRoutines(now, 200, deps),
    lib.dispatchDueRoutines(now, 200, deps),
  ])
  assert.equal(
    both.reduce((sum, r) => sum + r.started, 0),
    1
  )
  assert.equal(
    await lib.dispatchDueRoutines(now, 200, deps).then((r) => r.started),
    0
  )
  assert.deepEqual(
    posts.map((post) => post.id),
    [policy.routineRunMessageId(id, due)]
  )
})

test("a retried dispatch reuses the run's message ID, which is Trigger.dev's idempotency key", async () => {
  const { id, due } = await dueRoutine(OWNER, "bot_owner", "run_retry", 10_000)
  const routine = await row(id)
  const { deps, posts } = fakeDeps()
  await lib.runRoutine(routine, due, deps)
  await lib.runRoutine(routine, due, deps)
  await park(id)
  assert.equal(posts.length, 2)
  assert.equal(posts[0].id, posts[1].id)
  const events = await db.select().from(schema.activityEvents)
  assert.equal(events.filter((e) => e.dedupeKey === posts[0].id).length, 1)
})

test("outcomes: blocked and failed are recorded, and only for the owner's latest run", async () => {
  const first = await dueRoutine(OWNER, "bot_owner", "run_outcomes", 60_000)
  const { deps } = fakeDeps()
  await lib.runRoutine(await row(first.id), first.due, deps)
  const firstId = policy.routineRunMessageId(first.id, first.due)
  await park(first.id)

  // Someone else's report is refused
  assert.deepEqual(
    await lib.recordRoutineRunOutcome(OTHER, firstId, { status: "completed" }),
    { updated: false }
  )
  assert.equal((await row(first.id)).lastStatus, "started")

  assert.deepEqual(
    await lib.recordRoutineRunOutcome(OWNER, firstId, {
      status: "blocked",
      detail: "Waiting for your approval to send the email",
    }),
    { updated: true }
  )
  const blocked = await row(first.id)
  assert.equal(blocked.lastStatus, "blocked")
  assert.equal(blocked.lastError, "Waiting for your approval to send the email")

  // The next run starts; the earlier run's late report must not overwrite it
  const second = new Date(first.due.getTime() + 4 * 3_600_000)
  await lib.runRoutine(await row(first.id), second, deps)
  assert.deepEqual(
    await lib.recordRoutineRunOutcome(OWNER, firstId, { status: "failed" }),
    { updated: false }
  )
  const latest = await row(first.id)
  assert.equal(latest.lastStatus, "started")
  assert.equal(latest.lastRunAt?.getTime(), second.getTime())

  await lib.recordRoutineRunOutcome(
    OWNER,
    policy.routineRunMessageId(first.id, second),
    { status: "failed" }
  )
  const failed = await row(first.id)
  assert.equal(failed.lastStatus, "failed")
  assert.equal(failed.lastError, "The run didn't finish.")
})

test("messages that aren't routine runs, or name nothing, change nothing", async () => {
  for (const id of [
    undefined,
    "approval_x_approve",
    "routine_nope_1760000000000",
    "hello",
  ])
    assert.deepEqual(
      await lib.recordRoutineRunOutcome(OWNER, id, { status: "completed" }),
      { updated: false }
    )
})

test("a run found long overdue is recorded as missed, not run, and the cadence moves on", async () => {
  // Every four hours, found three hours late after an outage
  const { id, due } = await dueRoutine(
    OWNER,
    "bot_owner",
    "run_missed",
    3 * 3_600_000
  )
  const { deps, posts } = fakeDeps()
  const now = new Date()
  const result = await lib.dispatchDueRoutines(now, 200, deps)
  assert.equal(result.missed, 1)
  assert.equal(result.started, 0)
  assert.equal(posts.length, 0)

  const missed = await row(id)
  assert.equal(missed.lastStatus, "skipped")
  assert.equal(missed.lastError, "Missed while Krafty was unavailable")
  assert.equal(missed.lastRunAt?.getTime(), due.getTime())
  assert.ok(missed.nextRunAt && missed.nextRunAt > now)
  assert.equal(missed.enabled, true)
  const events = await db.select().from(schema.activityEvents)
  const event = events.find((e) => e.dedupeKey?.endsWith(":missed"))
  assert.equal(event?.kind, "routine_skipped")
  assert.equal(event?.detail, "Missed while Krafty was unavailable")

  // Nothing left to claim
  assert.equal(
    (await lib.dispatchDueRoutines(now, 200, deps)).missed,
    undefined
  )
})

test("a one-off reminder found a little late still runs, then finishes", async () => {
  const at = new Date(Math.floor((Date.now() - 20 * 60_000) / 1000) * 1000)
  const { id } = await dueRoutine(OWNER, "bot_owner", "run_once", 20 * 60_000, {
    kind: "once",
    at: new Date(Date.now() + 3_600_000).toISOString(),
  })
  await db
    .update(schema.routines)
    .set({ schedule: { kind: "once", at: at.toISOString() } })
    .where(eq(schema.routines.id, id))
  const { deps, posts } = fakeDeps()
  const result = await lib.dispatchDueRoutines(new Date(), 200, deps)
  assert.equal(result.started, 1)
  assert.equal(posts.length, 1)
  const finished = await row(id)
  assert.equal(finished.enabled, false)
  assert.equal(finished.nextRunAt, null)
})

test("a paused routine is never claimed", async () => {
  const { id } = await dueRoutine(OWNER, "bot_owner", "run_paused", 60_000)
  await db
    .update(schema.routines)
    .set({ enabled: false })
    .where(eq(schema.routines.id, id))
  const { deps, posts } = fakeDeps()
  await lib.dispatchDueRoutines(new Date(), 200, deps)
  assert.equal(posts.filter((p) => p.id.startsWith(`routine_${id}_`)).length, 0)
})

test("a run that can't start is recorded as failed, and one that fails the checks as skipped", async () => {
  const down = await dueRoutine(OWNER, "bot_owner", "run_down", 60_000)
  await lib.dispatchDueRoutines(new Date(), 200, fakeDeps({ fail: true }).deps)
  const failed = await row(down.id)
  assert.equal(failed.lastStatus, "failed")
  assert.equal(failed.lastError, "Couldn't start the run.")

  const spent = await dueRoutine(OWNER, "bot_owner", "run_spent", 60_000)
  const { deps, posts } = fakeDeps({
    skip: "Your AI allowance is used up until it resets.",
  })
  await lib.dispatchDueRoutines(new Date(), 200, deps)
  const skipped = await row(spent.id)
  assert.equal(skipped.lastStatus, "skipped")
  assert.equal(
    skipped.lastError,
    "Your AI allowance is used up until it resets."
  )
  assert.equal(posts.length, 0)
})

test("plan limits: the free plan gets one routine, a paid plan fifty", async () => {
  await lib.createRoutine(FREE, input("bot_free", "free_1"))
  await assert.rejects(
    lib.createRoutine(FREE, input("bot_free", "free_2")),
    /free plan includes one routine/
  )
  for (let index = 0; index < 50; index++)
    await lib.createRoutine(BIG, input("bot_big", `big_${index}`))
  await assert.rejects(
    lib.createRoutine(BIG, input("bot_big", "big_51")),
    /up to 50 routines/
  )
  // A retry of one that exists is not a new routine
  await lib.createRoutine(BIG, input("bot_big", "big_0"))
})

test("the owner's saved timezone is separate from the UTC fallback", async () => {
  assert.equal(await lib.savedTimeZone(OWNER), null)
  assert.equal(await lib.userTimeZone(OWNER), "UTC")
  await db
    .insert(schema.userSettings)
    .values({ userId: OWNER, timezone: "America/Chicago" })
  assert.equal(await lib.savedTimeZone(OWNER), "America/Chicago")
  assert.equal(await lib.userTimeZone(OWNER), "America/Chicago")
})

test("an outcome reported while the post is still in flight is not lost or overwritten", async () => {
  const { id, due } = await dueRoutine(OWNER, "bot_owner", "run_fast", 10_000)
  const messageId = policy.routineRunMessageId(id, due)
  let reported: { updated: boolean } | undefined
  const deps: Deps = {
    check: async () => undefined,
    // The turn finishes and reports before the append request returns
    post: async () => {
      reported = await lib.recordRoutineRunOutcome(OWNER, messageId, {
        status: "completed",
      })
    },
  }
  assert.equal(await lib.runRoutine(await row(id), due, deps), "started")
  assert.deepEqual(reported, { updated: true })
  const after = await row(id)
  assert.equal(after.lastStatus, "completed")
  assert.equal(after.lastError, null)
  assert.equal(after.lastRunAt?.getTime(), due.getTime())

  // Redispatching the same run (a retry) doesn't reopen a finished run
  await lib.runRoutine(after, due, fakeDeps().deps)
  assert.equal((await row(id)).lastStatus, "completed")
  await park(id)
})

test("a post that fails after the turn already reported leaves the outcome alone", async () => {
  const { id, due } = await dueRoutine(
    OWNER,
    "bot_owner",
    "run_fast_fail",
    10_000
  )
  const messageId = policy.routineRunMessageId(id, due)
  const deps: Deps = {
    check: async () => undefined,
    post: async () => {
      await lib.recordRoutineRunOutcome(OWNER, messageId, {
        status: "blocked",
        detail: "Waiting for your approval",
      })
      throw new Error("response lost")
    },
  }
  assert.equal(await lib.runRoutine(await row(id), due, deps), "failed")
  const after = await row(id)
  assert.equal(after.lastStatus, "blocked")
  await park(id)
})

// The sweep sees every account's started runs. Other tests' runs stay
// "running" so only this account's are judged on the chat lookup.
function stuckDeps(live: (chatId: string) => boolean | undefined) {
  const looked: string[] = []
  return {
    looked,
    deps: {
      chatRunLive: async (chatId: string) => {
        if (chatId !== "chat_stuck") return true
        looked.push(chatId)
        return live(chatId)
      },
    },
  }
}

const activityFor = (dedupePrefix: string) =>
  db
    .select()
    .from(schema.activityEvents)
    .where(
      and(
        eq(schema.activityEvents.userId, STUCK),
        like(schema.activityEvents.dedupeKey, `${dedupePrefix}%`)
      )
    )

const later = (ms: number) => new Date(Date.now() + ms)

test("#34: a run whose turn died is closed as failed once, with one activity and one push", async () => {
  await db.insert(schema.pushDevices).values({
    token: "ExponentPushToken[stuck]",
    userId: STUCK,
    platform: "ios",
  })
  const pushes: string[] = []
  const fetchMock = mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init?: { body?: string }) => {
      pushes.push(String(init?.body))
      return new Response(JSON.stringify({ data: [{ status: "ok" }] }))
    }
  )
  try {
    const { id, due } = await dueRoutine(STUCK, "bot_stuck", "run_dies", 60_000)
    assert.equal(
      await lib.runRoutine(await row(id), due, fakeDeps().deps),
      "started"
    )
    await park(id)
    const messageId = policy.routineRunMessageId(id, due)
    pushes.length = 0

    // Just posted: the chat run may not be listed yet
    const early = stuckDeps(() => false)
    await lib.closeStoppedRoutineRuns(new Date(), early.deps)
    assert.equal((await row(id)).lastStatus, "started")

    // Its chat run is still going: leave it be
    const busy = stuckDeps(() => true)
    await lib.closeStoppedRoutineRuns(
      later(policy.ROUTINE_RUN_START_GRACE_MS + 60_000),
      busy.deps
    )
    assert.deepEqual(busy.looked, ["chat_stuck"])
    assert.equal((await row(id)).lastStatus, "started")

    // The run was cancelled (or crashed): nothing will ever report on it
    const dead = stuckDeps(() => false)
    const result = await lib.closeStoppedRoutineRuns(
      later(policy.ROUTINE_RUN_START_GRACE_MS + 60_000),
      dead.deps
    )
    assert.ok(result.stopped >= 1)
    const closed = await row(id)
    assert.equal(closed.lastStatus, "failed")
    assert.equal(closed.lastError, policy.STOPPED_RUN_ERROR)
    assert.equal(closed.lastRunAt?.getTime(), due.getTime())

    const failures = await activityFor(`${messageId}:failed`)
    assert.equal(failures.length, 1)
    assert.equal(failures[0].kind, "routine_failed")
    assert.equal(failures[0].chatId, "chat_stuck")
    assert.equal(failures[0].detail, policy.STOPPED_RUN_ERROR)
    assert.equal(pushes.length, 1)
    assert.match(pushes[0], /ExponentPushToken\[stuck\]/)
    assert.match(pushes[0], /Inbox check didn't finish/)

    // Sweeping again, or a retried cron run, changes nothing and sends nothing
    await lib.closeStoppedRoutineRuns(
      later(policy.ROUTINE_RUN_START_GRACE_MS + 120_000),
      stuckDeps(() => false).deps
    )
    assert.equal((await activityFor(`${messageId}:failed`)).length, 1)
    assert.equal(pushes.length, 1)

    // A late report from the turn itself still wins
    await lib.recordRoutineRunOutcome(STUCK, messageId, { status: "completed" })
    assert.equal((await row(id)).lastStatus, "completed")
  } finally {
    fetchMock.mock.restore()
  }
})

test("#34: a run posted late is timed from its post, not from when it was due", async () => {
  const { id } = await dueRoutine(STUCK, "bot_stuck", "run_late", 60_000)
  // Due five hours ago (a one-off is still run that late), posted now
  const due = new Date(Math.floor((Date.now() - 5 * 3_600_000) / 1000) * 1000)
  assert.equal(
    await lib.runRoutine(await row(id), due, fakeDeps().deps),
    "started"
  )
  await park(id)
  // Trigger.dev can't be reached: only the longest turn time closes it
  const unknown = stuckDeps(() => undefined)
  await lib.closeStoppedRoutineRuns(later(10 * 60_000), unknown.deps)
  assert.equal((await row(id)).lastStatus, "started")
  await lib.closeStoppedRoutineRuns(
    later(policy.ROUTINE_RUN_MAX_MS + 60_000),
    stuckDeps(() => undefined).deps
  )
  const closed = await row(id)
  assert.equal(closed.lastStatus, "failed")
  assert.equal(closed.lastError, policy.STOPPED_RUN_ERROR)
})

test("#34: a turn that reported but lost its outcome is settled from its report, without a second notice", async () => {
  const { id, due } = await dueRoutine(
    STUCK,
    "bot_stuck",
    "run_reported",
    60_000
  )
  assert.equal(
    await lib.runRoutine(await row(id), due, fakeDeps().deps),
    "started"
  )
  await park(id)
  const messageId = policy.routineRunMessageId(id, due)
  // reportUnattendedTurn wrote (and pushed) this; recordRoutineRunOutcome failed
  await db.insert(schema.activityEvents).values({
    userId: STUCK,
    kind: "question_asked",
    title: "Relay has a question",
    chatId: "chat_stuck",
    dedupeKey: "turn:run_reported:0",
  })
  await lib.closeStoppedRoutineRuns(
    later(policy.ROUTINE_RUN_START_GRACE_MS + 60_000),
    stuckDeps(() => false).deps
  )
  const settled = await row(id)
  assert.equal(settled.lastStatus, "blocked")
  assert.equal(settled.lastError, "Waiting for you in the chat.")
  assert.equal((await activityFor(`${messageId}:failed`)).length, 0)
})

test("#34: a run left started long ago is closed quietly, without a push", async () => {
  const pushes: unknown[] = []
  const fetchMock = mock.method(
    globalThis,
    "fetch",
    async (...args: unknown[]) => {
      pushes.push(args)
      return new Response(JSON.stringify({ data: [{ status: "ok" }] }))
    }
  )
  try {
    const { id, due } = await dueRoutine(
      STUCK,
      "bot_stuck",
      "run_ancient",
      60_000
    )
    assert.equal(
      await lib.runRoutine(await row(id), due, fakeDeps().deps),
      "started"
    )
    await park(id)
    pushes.length = 0
    const messageId = policy.routineRunMessageId(id, due)
    // Found by the first sweep after this fix ships, days after it died
    await lib.closeStoppedRoutineRuns(
      later(policy.STOPPED_RUN_NOTIFY_MS + 60_000),
      stuckDeps(() => false).deps
    )
    assert.equal((await row(id)).lastStatus, "failed")
    assert.equal((await activityFor(`${messageId}:failed`)).length, 1)
    assert.equal(pushes.length, 0)
  } finally {
    fetchMock.mock.restore()
  }
})

const runRow = async (id: string) => {
  const [found] = await db
    .select()
    .from(schema.routineRuns)
    .where(eq(schema.routineRuns.id, id))
  return found
}

test("each run keeps its own history row: start, outcome and what its turns spent", async () => {
  const created = await lib.createRoutine(
    OWNER,
    input("bot_owner2", "history_1", { kind: "interval", hours: 6 })
  )
  await park(created.id)
  const routine = await row(created.id)
  const first = new Date("2026-10-26T13:00:00Z")
  const second = new Date("2026-10-26T19:00:00Z")
  const { deps } = fakeDeps()

  assert.equal(await lib.runRoutine(routine, first, deps), "started")
  const firstId = policy.routineRunMessageId(created.id, first)
  assert.equal((await runRow(firstId))?.status, "started")

  // The run asks for approval, and the turns resuming it finish it
  await lib.recordRoutineRunOutcome(OWNER, firstId, {
    status: "blocked",
    detail: "Waiting for your approval",
  })
  assert.equal((await runRow(firstId))?.status, "blocked")
  await lib.addRoutineRunSpend(OWNER, firstId, "ai:run_a:0", 12_000)
  await lib.addRoutineRunSpend(OWNER, firstId, "ai:run_b:0", 8_000)
  // The same turn reported twice counts once; another account adds nothing
  await lib.addRoutineRunSpend(OWNER, firstId, "ai:run_b:0", 8_000)
  await lib.addRoutineRunSpend(OTHER, firstId, "ai:run_c:0", 99_000)
  assert.equal((await runRow(firstId))?.spent, 20_000)

  // A newer run starts before the old one's last turn reports: each keeps
  // its own outcome, the routine shows the newest
  assert.equal(await lib.runRoutine(routine, second, deps), "started")
  await lib.recordRoutineRunOutcome(OWNER, firstId, { status: "completed" })
  assert.equal((await runRow(firstId))?.status, "completed")
  const secondId = policy.routineRunMessageId(created.id, second)
  assert.equal((await runRow(secondId))?.status, "started")
  assert.equal((await row(created.id)).lastStatus, "started")

  // A retried dispatch of a finished run never reopens it
  assert.equal(await lib.runRoutine(routine, first, deps), "started")
  assert.equal((await runRow(firstId))?.status, "completed")

  const runs = await lib.listRoutineRuns(OWNER, created.id)
  assert.deepEqual(
    runs.map((run) => [run.id, run.status, run.spent]),
    [
      [secondId, "started", 0],
      [firstId, "completed", 20_000],
    ]
  )
  await assert.rejects(lib.listRoutineRuns(OTHER, created.id), {
    message: "Routine not found",
  })
})

test("skipped and unstartable runs are in the history with why", async () => {
  const created = await lib.createRoutine(
    OWNER,
    input("bot_owner2", "history_2", { kind: "interval", hours: 6 })
  )
  await park(created.id)
  const routine = await row(created.id)
  const at = new Date("2026-10-27T01:00:00Z")
  const later = new Date("2026-10-27T07:00:00Z")
  await lib.runRoutine(routine, at, fakeDeps({ skip: "Out of allowance" }).deps)
  await lib.runRoutine(routine, later, fakeDeps({ fail: true }).deps)
  const runs = await lib.listRoutineRuns(OWNER, created.id)
  assert.deepEqual(
    runs.map((run) => [run.status, run.detail]),
    [
      ["failed", "Couldn't start the run."],
      ["skipped", "Out of allowance"],
    ]
  )
})
