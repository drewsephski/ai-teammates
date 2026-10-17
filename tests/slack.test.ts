import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { eq } from "drizzle-orm"

import { startTestDatabase } from "./helpers/test-db"

// Slack on in-memory Postgres: an install traded with a fake Slack, events
// routed to the right bot through a fake postChatMessage, and replies posted
// back with the sealed token. Nothing reaches Slack, Trigger.dev or Clerk.

const OWNER = "user_owner"
const OTHER = "user_other"

let database: Awaited<ReturnType<typeof startTestDatabase>>
let db: typeof import("../db").db
let schema: typeof import("../db/schema")
let lib: typeof import("../lib/slack")

type Deps = import("../lib/slack").SlackEventDeps

function fakeSlack(install: { team: string; user: string; token: string }) {
  const calls: { url: string; auth?: string; body: string }[] = []
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    calls.push({
      url: String(url),
      auth: headers.Authorization,
      body: String(init?.body ?? ""),
    })
    if (String(url).endsWith("oauth.v2.access"))
      return Response.json({
        ok: true,
        access_token: install.token,
        bot_user_id: "UAPP",
        team: { id: install.team, name: "Acme" },
        authed_user: { id: install.user },
      })
    return Response.json({ ok: true })
  }) as typeof fetch
  return { fetchImpl, calls }
}

function fakeDeps(options: { skip?: string } = {}) {
  const posts: {
    chatId: string
    id: string
    text: string
    display?: string
    botId?: string
  }[] = []
  const replies: { channel: string; threadTs: string; text: string }[] = []
  const deps: Deps = {
    post: async (chatId, message, opts) => {
      posts.push({
        chatId,
        id: message.id,
        text: message.text,
        display: message.displayPrompt,
        botId: opts?.botId,
      })
    },
    check: async () => options.skip,
    reply: async (_installation, target, text) => {
      replies.push({ ...target, text })
    },
  }
  return { deps, posts, replies }
}

const event = (patch: Record<string, unknown> = {}) => ({
  type: "event_callback",
  team_id: "T1",
  event: {
    type: "message",
    channel_type: "im",
    user: "UOWNER",
    text: "summarise my inbox",
    channel: "D1",
    ts: "1700000000.000100",
    ...patch,
  },
})

before(async () => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = "cd".repeat(32)
  process.env.SLACK_CLIENT_ID = "cid"
  process.env.SLACK_CLIENT_SECRET = "csecret"
  process.env.SLACK_SIGNING_SECRET = "ssecret"
  database = await startTestDatabase()
  ;({ db } = await import("../db"))
  schema = await import("../db/schema")
  lib = await import("../lib/slack")

  const now = new Date()
  await db.insert(schema.bots).values([
    {
      id: "bot_quill",
      userId: OWNER,
      name: "Quill",
      job: "Writer",
      createdAt: new Date(now.getTime() - 60_000),
    },
    { id: "bot_ledger", userId: OWNER, name: "Ledger", job: "Analyst" },
    { id: "bot_other", userId: OTHER, name: "Scout", job: "Researcher" },
  ])
  await db.insert(schema.chats).values([
    { id: "chat_quill", userId: OWNER, kind: "direct" },
    { id: "chat_ledger", userId: OWNER, kind: "direct" },
  ])
  await db.insert(schema.chatMembers).values([
    { chatId: "chat_quill", botId: "bot_quill" },
    { chatId: "chat_ledger", botId: "bot_ledger" },
  ])
})

after(async () => {
  await database?.stop()
})

test("installing binds the approving Slack member to the account, sealed", async () => {
  const { fetchImpl, calls } = fakeSlack({
    team: "T1",
    user: "UOWNER",
    token: "xoxb-owner-token",
  })
  const status = await lib.completeSlackInstall(
    OWNER,
    { code: "code1", redirectUri: "https://k.test/api/slack/callback" },
    fetchImpl
  )
  assert.equal(status.connected, true)
  assert.equal(status.teamName, "Acme")
  assert.match(calls[0].body, /code=code1/)
  const [row] = await db
    .select()
    .from(schema.slackInstallations)
    .where(eq(schema.slackInstallations.userId, OWNER))
  assert.equal(row.slackUserId, "UOWNER")
  assert.doesNotMatch(row.botToken, /xoxb/)
})

test("a failed exchange is reported in the person's words", async () => {
  const broken = (async () =>
    Response.json({ ok: false, error: "invalid_code" })) as typeof fetch
  await assert.rejects(
    lib.completeSlackInstall(
      OTHER,
      { code: "bad", redirectUri: "https://k.test/api/slack/callback" },
      broken
    ),
    /^Error: Couldn't connect Slack\. Try again\.$/
  )
  assert.equal((await lib.getSlackStatus(OTHER)).connected, false)
})

test("the owner's direct message posts into the default bot's chat", async () => {
  const { deps, posts } = fakeDeps()
  assert.equal(await lib.handleSlackEvent(event(), deps), "posted")
  assert.equal(posts.length, 1)
  assert.equal(posts[0].chatId, "chat_quill")
  assert.equal(posts[0].botId, "bot_quill")
  assert.equal(posts[0].id, "slack_T1_D1_1700000000.000100_1700000000.000100")
  assert.equal(posts[0].display, "summarise my inbox")
  assert.match(posts[0].text, /^Sent from Slack\./)
})

test("naming a bot, or a default bot, picks who answers", async () => {
  const { deps, posts } = fakeDeps()
  await lib.handleSlackEvent(
    event({
      type: "app_mention",
      channel_type: "channel",
      channel: "C9",
      text: "<@UAPP> Ledger: tally March",
      ts: "1700000001.000100",
      thread_ts: "1700000000.000900",
    }),
    deps
  )
  assert.equal(posts[0].botId, "bot_ledger")
  assert.equal(posts[0].chatId, "chat_ledger")
  assert.equal(posts[0].display, "tally March")
  assert.equal(posts[0].id, "slack_T1_C9_1700000000.000900_1700000001.000100")

  // A follow-up in that thread stays with Ledger without naming it
  await lib.handleSlackEvent(
    event({
      type: "app_mention",
      channel_type: "channel",
      channel: "C9",
      text: "<@UAPP> and April?",
      ts: "1700000001.000500",
      thread_ts: "1700000000.000900",
    }),
    deps
  )
  assert.equal(posts[1].botId, "bot_ledger")
  posts.length = 0

  // Another account's bot can't be the default
  await assert.rejects(
    lib.updateSlackSettings(OWNER, { botId: "bot_other" }),
    /Bot not found/
  )
  await assert.rejects(
    lib.updateSlackSettings(OTHER, { botId: "bot_other" }),
    /Slack connection not found/
  )
  assert.equal(
    (await lib.updateSlackSettings(OWNER, { botId: "bot_ledger" })).botId,
    "bot_ledger"
  )
  await lib.handleSlackEvent(event({ ts: "1700000002.000100" }), deps)
  assert.equal(posts[0].botId, "bot_ledger")
  await lib.updateSlackSettings(OWNER, { botId: null })
})

test("nobody else in the workspace reaches the owner's bots", async () => {
  const { deps, posts, replies } = fakeDeps()
  assert.equal(
    await lib.handleSlackEvent(event({ user: "UCOWORKER" }), deps),
    "not_installed"
  )
  assert.equal(
    await lib.handleSlackEvent({ ...event(), team_id: "T2" }, deps),
    "not_installed"
  )
  // The app's own replies and edits are ignored
  assert.equal(
    await lib.handleSlackEvent(event({ bot_id: "B1" }), deps),
    "ignored"
  )
  assert.equal(
    await lib.handleSlackEvent(event({ subtype: "message_changed" }), deps),
    "ignored"
  )
  assert.equal(
    await lib.handleSlackEvent(event({ text: "<@UAPP>" }), deps),
    "ignored"
  )
  assert.equal(
    await lib.handleSlackEvent({ type: "nonsense" }, deps),
    "ignored"
  )
  assert.equal(posts.length, 0)
  assert.equal(replies.length, 0)
})

test("a plan or allowance problem is answered in the thread", async () => {
  const { deps, posts, replies } = fakeDeps({
    skip: "Your AI allowance is used up until it resets.",
  })
  assert.equal(
    await lib.handleSlackEvent(event({ ts: "1700000003.000100" }), deps),
    "skipped"
  )
  assert.equal(posts.length, 0)
  assert.deepEqual(replies, [
    {
      channel: "D1",
      threadTs: "1700000003.000100",
      text: "Quill can't start: Your AI allowance is used up until it resets.",
    },
  ])
})

test("the turn's answer goes back to its thread with the owner's token", async () => {
  const { fetchImpl, calls } = fakeSlack({
    team: "T1",
    user: "UOWNER",
    token: "",
  })
  const messageId = "slack_T1_C9_1700000000.000900_1700000001.000100"
  assert.deepEqual(
    await lib.postSlackTurnReply(
      OWNER,
      messageId,
      {
        chatId: "chat_ledger",
        botName: "Ledger",
        outcome: { kind: "reply", text: "**March:** $40" },
      },
      fetchImpl
    ),
    { posted: true }
  )
  assert.equal(calls[0].url, "https://slack.com/api/chat.postMessage")
  assert.equal(calls[0].auth, "Bearer xoxb-owner-token")
  const body = JSON.parse(calls[0].body)
  assert.equal(body.channel, "C9")
  assert.equal(body.thread_ts, "1700000000.000900")
  assert.match(
    body.text,
    /^\*March:\* \$40\n\n<https:\/\/kraftybot\.app\/chats\/chat_ledger\|Open in Krafty>$/
  )

  // Not another account's installation, and not a non-Slack message
  assert.deepEqual(
    await lib.postSlackTurnReply(
      OTHER,
      messageId,
      {
        chatId: "c",
        botName: "x",
        outcome: { kind: "approval" },
      },
      fetchImpl
    ),
    { posted: false }
  )
  assert.deepEqual(
    await lib.postSlackTurnReply(
      OWNER,
      "routine_1_2",
      {
        chatId: "c",
        botName: "x",
        outcome: { kind: "approval" },
      },
      fetchImpl
    ),
    { posted: false }
  )
  assert.equal(calls.length, 1)
})

test("a member who reinstalls for another account moves with it", async () => {
  const { fetchImpl } = fakeSlack({
    team: "T1",
    user: "UOWNER",
    token: "xoxb-2",
  })
  await lib.completeSlackInstall(
    OTHER,
    { code: "code2", redirectUri: "https://k.test/api/slack/callback" },
    fetchImpl
  )
  assert.equal((await lib.getSlackStatus(OWNER)).connected, false)
  assert.equal((await lib.getSlackStatus(OTHER)).connected, true)
})

test("disconnecting revokes the token and removes the workspace", async () => {
  const { fetchImpl, calls } = fakeSlack({
    team: "T1",
    user: "UOWNER",
    token: "",
  })
  const status = await lib.disconnectSlack(OTHER, fetchImpl)
  assert.equal(status.connected, false)
  assert.equal(calls[0].url, "https://slack.com/api/auth.revoke")
  assert.equal(calls[0].auth, "Bearer xoxb-2")
  // Nothing left to disconnect is not an error
  assert.equal((await lib.disconnectSlack(OTHER, fetchImpl)).connected, false)
})
