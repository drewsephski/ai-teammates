import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { eq } from "drizzle-orm"

import { startTestDatabase } from "./helpers/test-db"

// Event triggers on in-memory Postgres: created for a bot, called through
// their token with a fake postChatMessage, and given the outcome the turn
// reports. Nothing reaches Trigger.dev, Clerk or a model. Plans come from the
// account_plans cache.

const OWNER = "user_owner"
const OTHER = "user_other"
const FREE = "user_free"
const ORIGIN = "https://krafty.test"

let database: Awaited<ReturnType<typeof startTestDatabase>>
let db: typeof import("../db").db
let schema: typeof import("../db/schema")
let lib: typeof import("../lib/bot-triggers")
let policy: typeof import("../lib/trigger-policy")

type Deps = import("../lib/bot-triggers").TriggerEventDeps

function fakeDeps(options: { skip?: string; fail?: boolean } = {}) {
  const posts: { chatId: string; id: string; text: string; botId?: string }[] =
    []
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
    check: async () => options.skip,
  }
  return { deps, posts }
}

const tokenOf = (url: string | null, address: string | null) =>
  (url?.split("/").pop() ?? address?.split("@")[0])!

const webhook = (key: string, body = '{"ok":true}') => ({
  kind: "webhook" as const,
  key,
  webhook: { contentType: "application/json", body, headers: {} },
})

before(async () => {
  process.env.INBOUND_EMAIL_DOMAIN = "in.krafty.test"
  database = await startTestDatabase()
  ;({ db } = await import("../db"))
  schema = await import("../db/schema")
  lib = await import("../lib/bot-triggers")
  policy = await import("../lib/trigger-policy")

  const now = new Date()
  const period = {
    periodStart: new Date(now.getTime() - 86_400_000),
    periodEnd: new Date(now.getTime() + 30 * 86_400_000),
  }
  await db.insert(schema.accountPlans).values([
    { userId: OWNER, tier: "paid", ...period, checkedAt: now },
    { userId: OTHER, tier: "paid", ...period, checkedAt: now },
    { userId: FREE, tier: "free", checkedAt: now },
  ])
  await db.insert(schema.bots).values([
    { id: "bot_owner", userId: OWNER, name: "Quill", job: "Writer" },
    { id: "bot_other", userId: OTHER, name: "Scout", job: "Researcher" },
    { id: "bot_free", userId: FREE, name: "Solo", job: "Helper" },
  ])
  await db.insert(schema.chats).values([
    { id: "chat_owner", userId: OWNER, kind: "direct" },
    { id: "chat_other", userId: OTHER, kind: "direct" },
  ])
  await db.insert(schema.chatMembers).values([
    { chatId: "chat_owner", botId: "bot_owner" },
    { chatId: "chat_other", botId: "bot_other" },
  ])
})

after(async () => {
  await database?.stop()
})

test("a webhook trigger reports to the bot's chat and is idempotent on requestId", async () => {
  const input = {
    botId: "bot_owner",
    kind: "webhook" as const,
    title: "New PR",
    prompt: "Review it",
    requestId: "pr",
  }
  const created = await lib.createTrigger(OWNER, input, ORIGIN)
  assert.equal(created.chatId, "chat_owner")
  assert.match(
    created.url!,
    /^https:\/\/krafty\.test\/api\/hooks\/[a-z2-7]{32}$/
  )
  assert.equal(created.address, null)
  assert.equal("token" in created, false)
  assert.equal("userId" in created, false)
  // Senders only apply to mail
  assert.deepEqual(created.allowedSenders, [])
  const again = await lib.createTrigger(OWNER, input, ORIGIN)
  assert.equal(again.id, created.id)
  assert.equal(again.url, created.url)
})

test("an email trigger gets an address, and needs the inbound domain", async () => {
  const created = await lib.createTrigger(
    OWNER,
    {
      botId: "bot_owner",
      kind: "email",
      title: "Invoices",
      prompt: "Log them",
      allowedSenders: ["@acme.io"],
      requestId: "mail",
    },
    ORIGIN
  )
  assert.match(created.address!, /^[a-z2-7]{32}@in\.krafty\.test$/)
  assert.equal(created.url, null)

  delete process.env.INBOUND_EMAIL_DOMAIN
  try {
    await assert.rejects(
      lib.createTrigger(
        OWNER,
        {
          botId: "bot_owner",
          kind: "email",
          title: "More mail",
          prompt: "Log them",
          requestId: "mail_off",
        },
        ORIGIN
      ),
      { message: policy.EMAIL_TRIGGERS_UNAVAILABLE_ERROR }
    )
  } finally {
    process.env.INBOUND_EMAIL_DOMAIN = "in.krafty.test"
  }
})

test("another account's bot and triggers are out of reach", async () => {
  await assert.rejects(
    lib.createTrigger(
      OTHER,
      {
        botId: "bot_owner",
        kind: "webhook",
        title: "Sneaky",
        prompt: "x",
        requestId: "sneak",
      },
      ORIGIN
    ),
    /Bot not found/
  )
  const [mine] = await lib.listTriggers(OWNER, ORIGIN)
  assert.deepEqual(await lib.listTriggers(OTHER, ORIGIN), [])
  await assert.rejects(
    lib.updateTrigger(OTHER, mine.id, { enabled: false }, ORIGIN),
    /Trigger not found/
  )
  await assert.rejects(lib.deleteTrigger(OTHER, mine.id), /Trigger not found/)
})

test("the free plan includes one trigger", async () => {
  const make = (requestId: string) =>
    lib.createTrigger(
      FREE,
      {
        botId: "bot_free",
        kind: "webhook",
        title: "Hook",
        prompt: "Do it",
        requestId,
      },
      ORIGIN
    )
  await make("free_1")
  await assert.rejects(make("free_2"), { message: policy.TRIGGER_LIMIT_ERROR })
})

test("an event posts once into the trigger's chat as an unattended turn", async () => {
  const trigger = (await lib.listTriggers(OWNER, ORIGIN)).find(
    (row) => row.title === "New PR"
  )!
  const token = tokenOf(trigger.url, null)
  const { deps, posts } = fakeDeps()

  assert.equal(
    await lib.receiveTriggerEvent(token, webhook("k1", '{"number":7}'), deps),
    "accepted"
  )
  assert.equal(posts.length, 1)
  assert.equal(posts[0].chatId, "chat_owner")
  assert.equal(posts[0].botId, "bot_owner")
  assert.equal(posts[0].id, policy.triggerEventMessageId(trigger.id, "k1"))
  assert.match(posts[0].text, /"number": 7/)
  assert.match(posts[0].text, /Review it$/)

  // The sender retries the same delivery
  assert.equal(
    await lib.receiveTriggerEvent(token, webhook("k1"), deps),
    "duplicate"
  )
  assert.equal(posts.length, 1)

  const [row] = await db
    .select()
    .from(schema.botTriggers)
    .where(eq(schema.botTriggers.id, trigger.id))
  assert.equal(row.lastStatus, "started")

  // Unknown tokens, the wrong kind and paused triggers wake nobody
  assert.equal(
    await lib.receiveTriggerEvent("a".repeat(32), webhook("k2"), deps),
    "not_found"
  )
  assert.equal(
    await lib.receiveTriggerEvent("../../", webhook("k2"), deps),
    "not_found"
  )
  assert.equal(
    await lib.receiveTriggerEvent(
      token,
      {
        kind: "email",
        key: "k2",
        email: { from: "a@b.co", to: [], subject: "", text: "" },
      },
      deps
    ),
    "not_found"
  )
  await lib.updateTrigger(OWNER, trigger.id, { enabled: false }, ORIGIN)
  assert.equal(
    await lib.receiveTriggerEvent(token, webhook("k3"), deps),
    "not_found"
  )
  await lib.updateTrigger(OWNER, trigger.id, { enabled: true }, ORIGIN)
  assert.equal(posts.length, 1)
})

test("the turn's outcome lands only on the latest event", async () => {
  const trigger = (await lib.listTriggers(OWNER, ORIGIN)).find(
    (row) => row.title === "New PR"
  )!
  const token = tokenOf(trigger.url, null)
  const { deps } = fakeDeps()
  await lib.receiveTriggerEvent(token, webhook("old"), deps)
  await lib.receiveTriggerEvent(token, webhook("new"), deps)
  const old = policy.triggerEventMessageId(trigger.id, "old")
  const latest = policy.triggerEventMessageId(trigger.id, "new")

  assert.deepEqual(
    await lib.recordTriggerOutcome(OWNER, old, { status: "completed" }),
    { updated: false }
  )
  // Another account can't report on it
  assert.deepEqual(
    await lib.recordTriggerOutcome(OTHER, latest, { status: "failed" }),
    { updated: false }
  )
  assert.deepEqual(
    await lib.recordTriggerOutcome(OWNER, latest, {
      status: "blocked",
      detail: "Waiting for your approval",
    }),
    { updated: true }
  )
  const [row] = await db
    .select()
    .from(schema.botTriggers)
    .where(eq(schema.botTriggers.id, trigger.id))
  assert.equal(row.lastStatus, "blocked")
  assert.equal(row.lastError, "Waiting for your approval")
})

test("mail from an unlisted sender is refused; a listed one wakes the bot", async () => {
  const trigger = (await lib.listTriggers(OWNER, ORIGIN)).find(
    (row) => row.kind === "email"
  )!
  const token = tokenOf(null, trigger.address)
  const { deps, posts } = fakeDeps()
  const mail = (from: string, key: string) => ({
    kind: "email" as const,
    key,
    email: {
      from,
      to: [trigger.address!],
      subject: "Invoice 9",
      text: "Due Friday",
    },
  })
  assert.equal(
    await lib.receiveTriggerEvent(token, mail("eve@evil.io", "m1"), deps),
    "sender_refused"
  )
  assert.equal(
    await lib.receiveTriggerEvent(token, mail("bills@acme.io", "m2"), deps),
    "accepted"
  )
  assert.equal(posts.length, 1)
  assert.match(posts[0].text, /^An email arrived for your trigger "Invoices"/)
  assert.match(posts[0].text, /From: bills@acme\.io/)
})

test("a plan or allowance problem skips the event and tells the owner", async () => {
  const trigger = (await lib.listTriggers(OWNER, ORIGIN)).find(
    (row) => row.title === "New PR"
  )!
  const token = tokenOf(trigger.url, null)
  const { deps, posts } = fakeDeps({ skip: "Your AI allowance is used up." })
  assert.equal(
    await lib.receiveTriggerEvent(token, webhook("skip"), deps),
    "skipped"
  )
  assert.equal(posts.length, 0)
  const events = await db
    .select()
    .from(schema.activityEvents)
    .where(eq(schema.activityEvents.userId, OWNER))
  assert.ok(
    events.some(
      (event) =>
        event.kind === "event_skipped" &&
        event.detail === "Your AI allowance is used up."
    )
  )
})

test("a failed wake lets the sender's retry try again", async () => {
  const trigger = (await lib.listTriggers(OWNER, ORIGIN)).find(
    (row) => row.title === "New PR"
  )!
  const token = tokenOf(trigger.url, null)
  assert.equal(
    await lib.receiveTriggerEvent(
      token,
      webhook("retry"),
      fakeDeps({ fail: true }).deps
    ),
    "failed"
  )
  const { deps, posts } = fakeDeps()
  assert.equal(
    await lib.receiveTriggerEvent(token, webhook("retry"), deps),
    "accepted"
  )
  assert.equal(posts.length, 1)
})

test("a flood past the hourly limit is dropped, with one notice", async () => {
  const created = await lib.createTrigger(
    OTHER,
    {
      botId: "bot_other",
      kind: "webhook",
      title: "Noisy",
      prompt: "x",
      requestId: "noisy",
    },
    ORIGIN
  )
  const token = tokenOf(created.url, null)
  const { deps, posts } = fakeDeps()
  const now = new Date()
  for (let index = 0; index < policy.TRIGGER_EVENTS_PER_HOUR; index++)
    assert.equal(
      await lib.receiveTriggerEvent(token, webhook(`n${index}`), deps, now),
      "accepted"
    )
  assert.equal(
    await lib.receiveTriggerEvent(token, webhook("over1"), deps, now),
    "rate_limited"
  )
  assert.equal(
    await lib.receiveTriggerEvent(token, webhook("over2"), deps, now),
    "rate_limited"
  )
  assert.equal(posts.length, policy.TRIGGER_EVENTS_PER_HOUR)
  const notices = await db
    .select()
    .from(schema.activityEvents)
    .where(eq(schema.activityEvents.userId, OTHER))
  assert.equal(
    notices.filter((event) => event.kind === "event_skipped").length,
    1
  )
  // An hour later it runs again
  assert.equal(
    await lib.receiveTriggerEvent(
      token,
      webhook("later"),
      deps,
      new Date(now.getTime() + 3_700_000)
    ),
    "accepted"
  )
})

test("delivery keys come from the sender's delivery ID, or the body", () => {
  const github = new Headers({ "x-github-delivery": "abc" })
  assert.equal(
    lib.webhookEventKey(github, "one"),
    lib.webhookEventKey(github, "two")
  )
  const none = new Headers()
  const now = Date.UTC(2026, 9, 17, 12)
  assert.equal(
    lib.webhookEventKey(none, "same", now),
    lib.webhookEventKey(none, "same", now + 60_000)
  )
  assert.notEqual(
    lib.webhookEventKey(none, "same", now),
    lib.webhookEventKey(none, "different", now)
  )
  for (const key of [
    lib.webhookEventKey(github, ""),
    lib.emailEventKey({ from: "a@b.co", to: [], subject: "", text: "" }),
  ])
    assert.match(key, /^[a-f0-9]{32}$/)
})

test("deleting a bot removes its triggers and their events", async () => {
  await db.delete(schema.bots).where(eq(schema.bots.id, "bot_other"))
  assert.deepEqual(await lib.listTriggers(OTHER, ORIGIN), [])
  const events = await db.select().from(schema.triggerEvents)
  const triggers = await db.select().from(schema.botTriggers)
  assert.ok(
    events.every((event) =>
      triggers.some((trigger) => trigger.id === event.triggerId)
    )
  )
})
