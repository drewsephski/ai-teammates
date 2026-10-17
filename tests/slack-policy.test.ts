import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { test } from "node:test"

import {
  fromSlackText,
  isPersonMessage,
  parseSlackMessageId,
  pickSlackBot,
  slackAuthorizeUrl,
  slackEventSchema,
  slackMessageId,
  slackReplyText,
  toSlackMarkdown,
  verifySlackSignature,
} from "../lib/slack-policy"
import { unattendedOrigin } from "../lib/routine-policy"

const secret = "signing-secret"
const sign = (timestamp: string, body: string) =>
  `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`

test("only fresh requests signed with the app's secret are accepted", () => {
  const now = Date.UTC(2026, 9, 17, 12)
  const timestamp = String(now / 1000)
  const body = '{"type":"event_callback"}'
  assert.ok(
    verifySlackSignature(
      secret,
      { timestamp, signature: sign(timestamp, body), body },
      now
    )
  )
  // Tampered body, wrong secret, missing headers
  assert.equal(
    verifySlackSignature(
      secret,
      { timestamp, signature: sign(timestamp, body), body: `${body} ` },
      now
    ),
    false
  )
  assert.equal(
    verifySlackSignature(
      "other",
      { timestamp, signature: sign(timestamp, body), body },
      now
    ),
    false
  )
  assert.equal(
    verifySlackSignature(
      secret,
      { timestamp: null, signature: null, body },
      now
    ),
    false
  )
  // A captured request replayed ten minutes later
  assert.equal(
    verifySlackSignature(
      secret,
      { timestamp, signature: sign(timestamp, body), body },
      now + 10 * 60_000
    ),
    false
  )
})

test("the install asks only for mentions, direct messages and replies", () => {
  const url = new URL(
    slackAuthorizeUrl("cid", "https://k.test/api/slack/callback", "st")
  )
  assert.equal(url.origin, "https://slack.com")
  assert.equal(
    url.searchParams.get("scope"),
    "app_mentions:read,chat:write,im:history,im:read,im:write"
  )
  assert.equal(url.searchParams.get("state"), "st")
})

test("people's mentions and direct messages count; bots, edits and channel chatter don't", () => {
  const base = {
    type: "event_callback",
    team_id: "T1",
    event: {
      type: "message",
      channel_type: "im",
      user: "U1",
      text: "hi",
      channel: "D1",
      ts: "1700000000.000100",
    },
  }
  const event = (patch: Record<string, unknown>) =>
    slackEventSchema.parse({ ...base, event: { ...base.event, ...patch } })
      .event
  assert.ok(isPersonMessage(event({})))
  assert.ok(
    isPersonMessage(event({ type: "app_mention", channel_type: "channel" }))
  )
  assert.equal(isPersonMessage(event({ bot_id: "B1" })), false)
  assert.equal(isPersonMessage(event({ subtype: "message_changed" })), false)
  assert.equal(isPersonMessage(event({ channel_type: "channel" })), false)
  assert.equal(isPersonMessage(event({ user: undefined })), false)
})

test("message IDs carry the reply thread and are not unattended", () => {
  const id = slackMessageId({
    teamId: "T1",
    channel: "C2",
    ts: "1700000001.000200",
    threadTs: "1700000000.000100",
  })
  assert.equal(id, "slack_T1_C2_1700000000.000100_1700000001.000200")
  assert.deepEqual(parseSlackMessageId(id), {
    teamId: "T1",
    channel: "C2",
    threadTs: "1700000000.000100",
    ts: "1700000001.000200",
  })
  // A top-level message is its own thread
  assert.equal(
    parseSlackMessageId(
      slackMessageId({ teamId: "T1", channel: "D1", ts: "1.2" })
    )?.threadTs,
    "1.2"
  )
  // The owner typed it, so routines may change in that turn
  assert.equal(unattendedOrigin(id), undefined)
  assert.equal(parseSlackMessageId("routine_1_2"), undefined)
})

test("incoming markup becomes plain text without the app's own mention", () => {
  assert.equal(
    fromSlackText(
      "<@UAPP> check <https://x.io/a|the doc> and <https://y.io> &amp; &lt;this&gt;",
      "UAPP"
    ),
    "check the doc (https://x.io/a) and https://y.io & <this>"
  )
})

test("a message goes to the bot it names, otherwise the default, otherwise the first", () => {
  const bots = [
    { id: "a", name: "Scout" },
    { id: "b", name: "Scout Prime" },
    { id: "c", name: "Ledger" },
  ]
  assert.deepEqual(pickSlackBot("ledger: tally March", bots, "a"), {
    bot: bots[2],
    text: "tally March",
  })
  // The longest matching name wins
  assert.equal(pickSlackBot("Scout Prime, go", bots)?.bot.id, "b")
  // A name without a separator is just a word
  assert.deepEqual(pickSlackBot("Ledger is great", bots, "a"), {
    bot: bots[0],
    text: "Ledger is great",
  })
  assert.equal(pickSlackBot("hello", bots, "missing")?.bot.id, "a")
  // A thread stays with its bot unless the message names another
  assert.equal(pickSlackBot("and April?", bots, "a", "c")?.bot.id, "c")
  assert.equal(pickSlackBot("Scout: you", bots, "a", "c")?.bot.id, "a")
  assert.equal(pickSlackBot("hi", bots, "a", "someone_else")?.bot.id, "a")
  assert.equal(pickSlackBot("hello", []), undefined)
})

test("replies are converted to mrkdwn, escaped and linked back to the chat", () => {
  assert.equal(
    toSlackMarkdown("## Plan\n**Ship** it <now> & see [docs](https://d.io)"),
    "*Plan*\n*Ship* it &lt;now&gt; &amp; see <https://d.io|docs>"
  )
  assert.ok(toSlackMarkdown("x".repeat(5000)).length <= 3501)
  const url = "https://kraftybot.app/chats/c1"
  assert.equal(
    slackReplyText({ kind: "reply", text: "Done" }, "Scout", url),
    `Done\n\n<${url}|Open in Krafty>`
  )
  assert.match(
    slackReplyText({ kind: "question", question: "Which repo?" }, "Scout", url),
    /^Which repo\?\n\nReply in this thread to answer/
  )
  assert.match(
    slackReplyText({ kind: "approval" }, "Scout", url),
    /waiting for your approval/
  )
  assert.match(
    slackReplyText({ kind: "failed", reason: "it broke." }, "Scout", url),
    /^Scout couldn't finish: it broke\./
  )
})
