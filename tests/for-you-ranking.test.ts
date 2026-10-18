import assert from "node:assert/strict"
import test from "node:test"

import {
  diversify,
  followUpRecords,
  forYouItemActionSchema,
  gmailRecords,
  isLowValue,
  scoreCandidate,
  sourceLabel,
  type ForYouRecord,
  type RankedCandidate,
} from "../lib/for-you"
import { selectRecords } from "../lib/generate-for-you"

const now = new Date("2026-10-17T12:00:00Z")
const daysAgo = (days: number) =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

function ranked(
  toolkit: string,
  category: RankedCandidate["category"],
  score: number,
  id = `${toolkit}:${category}:${score}`
): RankedCandidate {
  return {
    recordId: id,
    category,
    urgency: "today",
    importance: 4,
    title: id,
    reason: "Someone is waiting.",
    prompt: "Draft a reply for review.",
    botId: "quill",
    quote: "a verbatim quote",
    score,
    record: {
      id,
      toolkit,
      sourceId: id,
      kind: "item",
      title: id,
      signals: [],
    },
  }
}

test("one app can't fill For you, and code work is capped", () => {
  const chosen = diversify([
    ranked("github", "review", 0.95),
    ranked("github", "review", 0.94),
    ranked("github", "issue", 0.93),
    ranked("vercel", "issue", 0.92),
    ranked("gmail", "reply", 0.7),
    ranked("googlecalendar", "meeting_prep", 0.6),
    ranked("gmail", "follow_up", 0.55),
  ])
  const apps = chosen.map((entry) => entry.record.toolkit)
  assert.ok(apps.filter((app) => app === "github").length <= 2)
  assert.ok(
    chosen.filter((entry) => ["review", "issue"].includes(entry.category))
      .length <= 2
  )
  assert.ok(apps.includes("gmail"))
  assert.ok(apps.includes("googlecalendar"))
  assert.equal(chosen.length, 5)
  // Still best first when nothing is capped
  assert.equal(chosen[0].record.toolkit, "github")
})

test("unanswered sent mail becomes a follow-up, answered or recent mail doesn't", () => {
  const sent = {
    messages: [
      {
        messageId: "s1",
        threadId: "waiting",
        to: "Dana Kim <dana@example.com>",
        subject: "Saturday plans",
        messageText: "Are you free Saturday afternoon?",
        messageTimestamp: daysAgo(5),
      },
      {
        messageId: "s2",
        threadId: "answered",
        to: "sam@example.com",
        subject: "Lease renewal",
        messageTimestamp: daysAgo(6),
      },
      {
        messageId: "s3",
        threadId: "too-new",
        to: "lee@example.com",
        subject: "Quick question",
        messageTimestamp: daysAgo(1),
      },
      {
        messageId: "s4",
        threadId: "bot",
        to: "noreply@service.com",
        subject: "Unsubscribe",
        messageTimestamp: daysAgo(4),
      },
    ],
  }
  const inbox = {
    messages: [{ threadId: "answered", messageTimestamp: daysAgo(2) }],
  }
  const records = followUpRecords(sent, [inbox, undefined], now)
  assert.deepEqual(
    records.map((record) => record.id),
    ["gmail:sent:s1"]
  )
  assert.equal(records[0].kind, "sent_email")
  assert.match(records[0].signals[0], /5 days ago and have no reply yet/)
  assert.equal(sourceLabel(records[0]), "Your email to Dana Kim")
})

test("errands and questions are flagged; bulk mail sorts after mail from people", () => {
  const [bill, newsletter, question] = gmailRecords({
    messages: [
      {
        messageId: "m1",
        sender: "billing@utility.com",
        subject: "Your invoice is ready",
        labelIds: ["CATEGORY_UPDATES"],
      },
      {
        messageId: "m2",
        sender: "newsletter@site.com",
        subject: "This week in tech",
        labelIds: ["CATEGORY_UPDATES"],
      },
      {
        messageId: "m3",
        sender: "Ana <ana@example.com>",
        subject: "Dinner",
        messageText: "Does Friday work for you?",
      },
    ],
  })
  assert.ok(
    bill.signals.includes("looks like a bill, booking, deadline, or form")
  )
  assert.ok(!isLowValue(bill))
  assert.ok(isLowValue(newsletter))
  assert.ok(question.signals.includes("asks a question"))

  const chosen = selectRecords([newsletter, bill, question], new Set())
  assert.equal(chosen.at(-1)?.id, newsletter.id)
})

test("apps the person keeps dismissing score lower", () => {
  const candidate = {
    category: "review" as const,
    urgency: "today" as const,
    importance: 4,
  }
  const record: Pick<ForYouRecord, "signals" | "toolkit"> = {
    signals: [],
    toolkit: "github",
  }
  const base = scoreCandidate(candidate, record, { started: {}, dismissed: {} })
  const tired = scoreCandidate(candidate, record, {
    started: {},
    dismissed: {},
    dismissedApps: { github: 6 },
  })
  const other = scoreCandidate(
    candidate,
    { ...record, toolkit: "gmail" },
    { started: {}, dismissed: {}, dismissedApps: { github: 6 } }
  )
  assert.ok(tired < base)
  assert.equal(other, base)
})

test("card actions accept hiding an app and reject unknown actions", () => {
  assert.deepEqual(forYouItemActionSchema.parse({ type: "hide_app" }), {
    type: "hide_app",
  })
  assert.throws(() => forYouItemActionSchema.parse({ type: "delete" }))
})
