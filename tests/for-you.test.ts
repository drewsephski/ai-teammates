import assert from "node:assert/strict"
import test from "node:test"

import {
  calendarRecords,
  genericRecords,
  githubRecords,
  gmailRecords,
  isGrounded,
  rankCandidates,
  scoreCandidate,
  sentThreads,
  sourceLabel,
  type ForYouCandidate,
  type ForYouRecord,
} from "../lib/for-you"
import { readDirectSources } from "../lib/for-you-sources"
import { selectRecords } from "../lib/generate-for-you"

const noFeedback = { excluded: new Set<string>(), started: {}, dismissed: {} }

test("Gmail records carry who wrote, what about, and reply signals", () => {
  const replied = sentThreads({
    messages: [
      { threadId: "t-replied", messageTimestamp: "2026-10-14T12:00:00Z" },
    ],
  })
  const records = gmailRecords(
    {
      messages: [
        {
          messageId: "m1",
          threadId: "t1",
          subject: "Q4 budget",
          sender: "Dana Kim <dana@acme.com>",
          messageTimestamp: "2026-10-14T09:00:00Z",
          messageText: "Can you send the revised numbers by Friday?",
          labelIds: ["INBOX", "UNREAD", "IMPORTANT"],
          payload: { parts: ["huge mime payload"] },
        },
        {
          messageId: "m2",
          threadId: "t-replied",
          subject: "Lunch",
          sender: "sam@example.com",
          messageTimestamp: "2026-10-13T09:00:00Z",
          labelIds: ["INBOX"],
        },
        {
          messageId: "m3",
          threadId: "t3",
          subject: "Your weekly digest",
          sender: "Digest <no-reply@service.com>",
          labelIds: ["INBOX", "CATEGORY_UPDATES"],
        },
        { subject: "no id is ignored" },
      ],
    },
    { repliedThreads: replied }
  )
  assert.equal(records.length, 3)
  assert.deepEqual(records[0], {
    id: "gmail:m1",
    toolkit: "gmail",
    sourceId: "m1",
    kind: "email",
    title: "Q4 budget",
    from: "Dana Kim <dana@acme.com>",
    when: "2026-10-14T09:00:00Z",
    url: undefined,
    excerpt: "Can you send the revised numbers by Friday?",
    signals: ["unread", "Gmail marked important", "asks a question"],
  })
  assert.ok(records[1].signals.includes("you already replied in this thread"))
  assert.ok(records[2].signals.includes("likely automated or bulk mail"))
  assert.equal(sourceLabel(records[0]), "Email from Dana Kim")
})

test("calendar records skip declined and cancelled events and note RSVPs", () => {
  const records = calendarRecords({
    items: [
      {
        id: "e1",
        summary: "Pricing review",
        start: { dateTime: "2026-10-16T15:00:00Z" },
        htmlLink: "https://calendar.google.com/e1",
        attendees: [
          { email: "me@x.com", self: true, responseStatus: "needsAction" },
          { email: "dana@acme.com", displayName: "Dana Kim" },
        ],
      },
      {
        id: "e2",
        summary: "Declined",
        start: { dateTime: "2026-10-16T16:00:00Z" },
        attendees: [{ self: true, responseStatus: "declined" }],
      },
      { id: "e3", status: "cancelled", summary: "Gone" },
    ],
  })
  assert.equal(records.length, 1)
  assert.equal(records[0].title, "Pricing review")
  assert.match(records[0].excerpt ?? "", /Dana Kim/)
  assert.deepEqual(records[0].signals, [
    "1 other attendee",
    "awaiting your RSVP",
  ])
})

test("GitHub records name the repo and why they surfaced", () => {
  const [record] = githubRecords(
    {
      items: [
        {
          id: 1,
          number: 42,
          title: "Fix login race",
          html_url: "https://github.com/acme/app/pull/42",
          repository_url: "https://api.github.com/repos/acme/app",
          pull_request: {},
          user: { login: "octo" },
          comments: 3,
        },
      ],
    },
    "your review is requested"
  )
  assert.equal(record.kind, "pull_request")
  assert.equal(record.title, "acme/app#42 Fix login race")
  assert.deepEqual(record.signals, ["your review is requested", "3 comments"])
})

test("generic records keep child records separate from their parent", () => {
  const records = genericRecords("vercel", {
    deployments: [
      {
        uid: "dpl_1",
        name: "web",
        state: "ERROR",
        url: "https://web-abc.vercel.app",
        meta: { id: "child", title: "nested commit message" },
      },
    ],
  })
  const parent = records.find((record) => record.sourceId === "dpl_1")
  assert.ok(parent)
  assert.equal(parent.title, "web")
  assert.equal(parent.excerpt, "ERROR")
  assert.doesNotMatch(parent.excerpt ?? "", /nested/)
  assert.ok(records.some((record) => record.sourceId === "child"))
})

const record: ForYouRecord = {
  id: "gmail:m1",
  toolkit: "gmail",
  sourceId: "m1",
  kind: "email",
  title: "Q4 budget",
  from: "Dana Kim",
  excerpt: "Can you send the revised numbers by Friday?",
  signals: ["unread"],
}
const candidate: ForYouCandidate = {
  recordId: "gmail:m1",
  category: "reply",
  urgency: "today",
  importance: 4,
  title: "Reply to Dana about the Q4 budget",
  reason: "Dana asked for revised numbers by Friday.",
  prompt: "Draft a reply to Dana Kim's 'Q4 budget' email for me to review.",
  botId: "quill",
  quote: "send the revised  numbers by Friday",
}

test("grounding requires a real record and a verbatim quote", () => {
  assert.equal(isGrounded(candidate, [record]), record)
  assert.equal(
    isGrounded({ ...candidate, quote: "numbers by Monday" }, [record]),
    undefined
  )
  assert.equal(
    isGrounded({ ...candidate, recordId: "gmail:invented" }, [record]),
    undefined
  )
})

test("ranking drops ungrounded, unknown-bot, excluded and duplicate candidates", () => {
  const ranked = rankCandidates(
    [
      candidate,
      { ...candidate, title: "Duplicate of the same email" },
      { ...candidate, botId: "nobody" },
      { ...candidate, recordId: "gmail:invented" },
    ],
    [record],
    [{ id: "quill" }],
    noFeedback
  )
  assert.equal(ranked.length, 1)
  assert.equal(ranked[0].title, candidate.title)

  const dismissed = rankCandidates([candidate], [record], [{ id: "quill" }], {
    ...noFeedback,
    excluded: new Set(["gmail:m1"]),
  })
  assert.equal(dismissed.length, 0)
})

test("feedback and signals move scores in the expected direction", () => {
  const base = scoreCandidate(candidate, record, noFeedback)
  const liked = scoreCandidate(candidate, record, {
    started: { reply: 5 },
    dismissed: {},
  })
  const disliked = scoreCandidate(candidate, record, {
    started: {},
    dismissed: { reply: 5 },
  })
  const bulk = scoreCandidate(
    candidate,
    { signals: ["likely automated or bulk mail"] },
    noFeedback
  )
  assert.ok(liked > base && base > disliked)
  assert.ok(bulk < base)
})

test("record selection round-robins apps so one inbox can't crowd out others", () => {
  const many = Array.from({ length: 60 }, (_, index) => ({
    ...record,
    id: `gmail:${index}`,
    sourceId: String(index),
  }))
  const event: ForYouRecord = {
    ...record,
    id: "googlecalendar:e1",
    toolkit: "googlecalendar",
    kind: "event",
  }
  const chosen = selectRecords([...many, event], new Set(["gmail:0"]))
  assert.ok(chosen.some((entry) => entry.id === "googlecalendar:e1"))
  assert.ok(!chosen.some((entry) => entry.id === "gmail:0"))
  assert.ok(chosen.length <= 40)
})

test("one failing app does not hide the others", async () => {
  const calls: string[] = []
  const result = await readDirectSources({
    userId: "alice",
    accounts: [
      { id: "a-gmail", toolkit: "gmail" },
      { id: "a-github", toolkit: "github" },
      { id: "a-cal", toolkit: "googlecalendar" },
    ],
    runtime: {
      accounts: async () => [],
      search: async () => ({ tools: [], guidance: null }),
      schema: async () => undefined,
      execute: async (_user, slug, input, account) => {
        calls.push(`${account.toolkit}:${slug}`)
        if (account.toolkit === "github") throw new Error("token revoked")
        if (slug === "GMAIL_FETCH_EMAILS")
          return {
            resultType: "completed",
            error: null,
            data: String(input.query).startsWith("in:sent")
              ? { messages: [] }
              : {
                  messages: [
                    { messageId: "m1", subject: "Hi", sender: "a@b.c" },
                  ],
                },
          }
        return {
          resultType: "failed",
          error: "calendar API disabled",
          data: {},
        }
      },
    },
    signal: new AbortController().signal,
  })
  assert.deepEqual(result.checked, ["gmail"])
  assert.deepEqual(result.failed.sort(), ["github", "googlecalendar"])
  assert.equal(result.records.length, 1)
  assert.ok(calls.every((call) => !/SEND|CREATE|DELETE|UPDATE/.test(call)))
})
