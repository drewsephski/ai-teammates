import assert from "node:assert/strict"
import { after, before, test } from "node:test"

import {
  localHour,
  morningSummary,
  summaryDue,
  summaryWindowStart,
} from "../lib/morning-summary-policy"
import { startTestDatabase } from "./helpers/test-db"

// 2026-10-27 15:05 UTC is 08:05 in Los Angeles (PDT) and 15:05 in London (GMT)
const now = new Date("2026-10-27T15:05:00Z")
const settings = {
  morningSummary: true,
  timezone: "America/Los_Angeles",
  digestHour: 8,
  lastSummaryAt: null as Date | null,
}

test("a summary is due at the person's own morning, once a day", () => {
  assert.equal(localHour(now, "America/Los_Angeles"), 8)
  assert.equal(localHour(now, "Asia/Kolkata"), 20)
  assert.equal(localHour(now, "Not/AZone"), undefined)
  assert.equal(summaryDue(settings, now), true)
  assert.equal(summaryDue({ ...settings, morningSummary: false }, now), false)
  // UTC is the column default: a timezone they never chose
  assert.equal(summaryDue({ ...settings, timezone: "UTC" }, now), false)
  assert.equal(
    summaryDue({ ...settings, timezone: "Europe/London" }, now),
    false
  )
  assert.equal(summaryDue({ ...settings, timezone: "Not/AZone" }, now), false)
  assert.equal(
    summaryDue(
      { ...settings, lastSummaryAt: new Date("2026-10-27T15:00:00Z") },
      now
    ),
    false
  )
  assert.equal(
    summaryDue(
      { ...settings, lastSummaryAt: new Date("2026-10-26T15:05:00Z") },
      now
    ),
    true
  )
})

test("a summary covers the time since the last one, at most a day", () => {
  const dayAgo = new Date("2026-10-26T15:05:00Z")
  assert.deepEqual(summaryWindowStart(null, now), dayAgo)
  assert.deepEqual(
    summaryWindowStart(new Date("2026-10-20T00:00:00Z"), now),
    dayAgo
  )
  const recent = new Date("2026-10-27T01:00:00Z")
  assert.deepEqual(summaryWindowStart(recent, now), recent)
})

test("the summary counts what happened and says nothing when nothing did", () => {
  assert.equal(morningSummary([], 0), null)
  // Already decided overnight: nothing left to report
  assert.equal(morningSummary([{ kind: "approval_requested" }], 0), null)
  assert.equal(morningSummary([{ kind: "routine_started" }], 0), null)
  assert.deepEqual(
    morningSummary(
      [
        { kind: "work_finished" },
        { kind: "work_finished" },
        { kind: "approval_requested" },
        { kind: "question_asked" },
        { kind: "routine_failed" },
        { kind: "routine_skipped" },
      ],
      1
    ),
    {
      title: "While you were away",
      body: "2 tasks finished · 1 approval waiting · 1 question for you · 2 tasks didn't finish",
      path: "/activity",
    }
  )
  assert.equal(
    morningSummary([{ kind: "work_finished" }], 0)?.body,
    "1 task finished"
  )
})

let database: Awaited<ReturnType<typeof startTestDatabase>>
let sendMorningSummaries: typeof import("../lib/morning-summary").sendMorningSummaries

before(async () => {
  database = await startTestDatabase()
  ;({ sendMorningSummaries } = await import("../lib/morning-summary"))
  const { db } = await import("../db")
  const schema = await import("../db/schema")
  await db.insert(schema.userSettings).values([
    // Due, with a phone, and things happened
    { userId: "user_due", timezone: "America/Los_Angeles" },
    // Due and with a phone, but nothing happened
    { userId: "user_quiet", timezone: "America/Los_Angeles" },
    // Turned it off
    {
      userId: "user_off",
      timezone: "America/Los_Angeles",
      morningSummary: false,
    },
    // Never chose a timezone
    { userId: "user_utc" },
    // No phone to send to
    { userId: "user_nophone", timezone: "America/Los_Angeles" },
  ])
  await db.insert(schema.pushDevices).values(
    ["user_due", "user_quiet", "user_off", "user_utc"].map((userId) => ({
      token: `ExponentPushToken[${userId}]`,
      userId,
      platform: "ios" as const,
    }))
  )
  await db.insert(schema.bots).values({
    id: "bot_due",
    userId: "user_due",
    name: "Scout",
    job: "Research",
  })
  await db.insert(schema.chats).values({ id: "chat_due", userId: "user_due" })
  const hourAgo = new Date(now.getTime() - 3_600_000)
  await db.insert(schema.activityEvents).values([
    {
      userId: "user_due",
      kind: "work_finished",
      title: "Scout finished",
      createdAt: hourAgo,
    },
    {
      userId: "user_due",
      kind: "approval_requested",
      title: "Scout wants to send",
      createdAt: hourAgo,
    },
    // Before the window: not counted
    {
      userId: "user_due",
      kind: "work_failed",
      title: "Old",
      createdAt: new Date("2026-10-20T00:00:00Z"),
    },
    // Someone else's
    {
      userId: "user_off",
      kind: "work_finished",
      title: "Other",
      createdAt: hourAgo,
    },
  ])
  await db.insert(schema.approvals).values({
    userId: "user_due",
    botId: "bot_due",
    chatId: "chat_due",
    toolkit: "gmail",
    toolSlug: "GMAIL_SEND_EMAIL",
    accountId: "acct",
    arguments: {},
    summary: "Send the weekly report",
    expiresAt: new Date(now.getTime() + 86_400_000),
  })
})

after(async () => {
  await database?.stop()
})

test("each person due a summary gets one, and a rerun sends nothing", async () => {
  const sent: { userId: string; body: string }[] = []
  const push = async (userId: string, notification: { body: string }) => {
    sent.push({ userId, body: notification.body })
  }
  const first = await sendMorningSummaries(now, push)
  assert.deepEqual(sent, [
    { userId: "user_due", body: "1 task finished · 1 approval waiting" },
  ])
  assert.equal(first.sent, 1)
  assert.equal(first.quiet, 1)

  // The same hour again, as a retry would: already claimed
  const again = await sendMorningSummaries(
    new Date(now.getTime() + 60_000),
    push
  )
  assert.equal(again.sent, 0)
  assert.equal(sent.length, 1)
})
