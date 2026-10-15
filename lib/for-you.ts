import { z } from "zod"

import type { ForYouCategory, ForYouUrgency } from "@/db/schema"

// One compact, verified record from a connected app (or a commitment the
// person stated). The ranking model only ever sees these, never raw provider
// JSON, so a scan costs a few thousand tokens instead of hundreds of thousands.
export type ForYouRecord = {
  // `${toolkit}:${sourceId}`, the item fingerprint
  id: string
  toolkit: string
  sourceId: string
  kind:
    | "email"
    | "event"
    | "issue"
    | "pull_request"
    | "page"
    | "commitment"
    | "item"
  title: string
  from?: string
  when?: string
  url?: string
  excerpt?: string
  // Deterministic facts that make a record more or less worth acting on
  signals: string[]
}

export const forYouCategories = [
  "reply",
  "meeting_prep",
  "review",
  "issue",
  "doc_followup",
  "commitment",
  "other",
] as const satisfies readonly ForYouCategory[]
export const forYouUrgencies = [
  "today",
  "this_week",
  "later",
] as const satisfies readonly ForYouUrgency[]

export const forYouCandidateSchema = z.object({
  recordId: z.string().min(1).max(600),
  category: z.enum(forYouCategories),
  urgency: z.enum(forYouUrgencies),
  // How much this matters to this person, 1-5
  importance: z.number().int().min(1).max(5),
  title: z.string().trim().min(1).max(90),
  reason: z.string().trim().min(1).max(220),
  prompt: z.string().trim().min(1).max(1200),
  botId: z.string().min(1).max(128),
  quote: z.string().trim().min(6).max(240),
})
export type ForYouCandidate = z.infer<typeof forYouCandidateSchema>
export const forYouOutputSchema = z.object({
  candidates: z.array(forYouCandidateSchema).max(5),
})

const MAX_TEXT = 600

function text(value: unknown, max = MAX_TEXT): string | undefined {
  if (typeof value === "number") return String(value)
  if (typeof value !== "string") return undefined
  const clean = value.replace(/\s+/g, " ").trim()
  return clean ? clean.slice(0, max) : undefined
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          !!entry && typeof entry === "object"
      )
    : []
}

function get(value: unknown, ...path: string[]): unknown {
  let current = value
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

// Provider envelopes differ by tool version; find the first list of records.
function listIn(data: unknown, keys: string[]): Record<string, unknown>[] {
  for (const key of keys) {
    const found = asArray(get(data, key))
    if (found.length) return found
    const nested = asArray(get(data, "data", key))
    if (nested.length) return nested
  }
  return asArray(data)
}

const automatedSender =
  /(?:no-?reply|donotreply|notifications?@|mailer-daemon|newsletter|digest|updates?@|news@|marketing|info@|hello@)/i

export function gmailRecords(
  data: unknown,
  options: { repliedThreads?: Map<string, number> } = {}
): ForYouRecord[] {
  return listIn(data, ["messages"]).flatMap((message): ForYouRecord[] => {
    const sourceId = text(message.messageId ?? message.id, 500)
    if (!sourceId) return []
    const labels = Array.isArray(message.labelIds)
      ? message.labelIds.map(String)
      : []
    const from = text(message.sender ?? message.from, 200)
    const when = text(message.messageTimestamp ?? message.date, 60)
    const excerpt = text(
      message.messageText ??
        get(message, "preview", "body") ??
        message.snippet ??
        get(message, "preview", "snippet")
    )
    const signals: string[] = []
    if (labels.includes("UNREAD")) signals.push("unread")
    if (labels.includes("IMPORTANT")) signals.push("Gmail marked important")
    if (labels.includes("STARRED")) signals.push("starred")
    if (
      labels.some((label) =>
        [
          "CATEGORY_UPDATES",
          "CATEGORY_PROMOTIONS",
          "CATEGORY_FORUMS",
          "CATEGORY_SOCIAL",
        ].includes(label)
      ) ||
      (from && automatedSender.test(from))
    )
      signals.push("likely automated or bulk mail")
    const threadId = text(message.threadId, 200)
    const repliedAt = threadId && options.repliedThreads?.get(threadId)
    const sentAt = when ? Date.parse(when) : NaN
    if (repliedAt && (Number.isNaN(sentAt) || repliedAt >= sentAt))
      signals.push("you already replied in this thread")
    return [
      {
        id: `gmail:${sourceId}`,
        toolkit: "gmail",
        sourceId,
        kind: "email",
        title: text(message.subject, 200) ?? "(no subject)",
        from,
        when,
        url: text(message.display_url, 500),
        excerpt,
        signals,
      },
    ]
  })
}

// Thread IDs the person has sent mail in, with the latest send time
export function sentThreads(data: unknown) {
  const threads = new Map<string, number>()
  for (const message of listIn(data, ["messages"])) {
    const threadId = text(message.threadId, 200)
    if (!threadId) continue
    const at = Date.parse(String(message.messageTimestamp ?? ""))
    threads.set(
      threadId,
      Math.max(threads.get(threadId) ?? 0, Number.isNaN(at) ? Date.now() : at)
    )
  }
  return threads
}

export function calendarRecords(data: unknown): ForYouRecord[] {
  return listIn(data, ["items", "events"]).flatMap((event): ForYouRecord[] => {
    const sourceId = text(event.id, 500)
    if (!sourceId || event.status === "cancelled") return []
    const attendees = asArray(event.attendees)
    const self = attendees.find((attendee) => attendee.self === true)
    if (self?.responseStatus === "declined") return []
    const start =
      text(get(event, "start", "dateTime"), 60) ??
      text(get(event, "start", "date"), 60)
    const others = attendees.filter(
      (attendee) => attendee.self !== true && attendee.resource !== true
    )
    const signals: string[] = []
    if (!get(event, "start", "dateTime")) signals.push("all-day")
    if (others.length)
      signals.push(
        `${others.length} other attendee${others.length === 1 ? "" : "s"}`
      )
    else signals.push("no other attendees")
    if (get(event, "organizer", "self") === true)
      signals.push("you organize it")
    if (self?.responseStatus === "needsAction")
      signals.push("awaiting your RSVP")
    if (asArray(event.attachments).length) signals.push("has attachments")
    const organizer =
      text(get(event, "organizer", "displayName"), 200) ??
      text(get(event, "organizer", "email"), 200)
    return [
      {
        id: `googlecalendar:${sourceId}`,
        toolkit: "googlecalendar",
        sourceId,
        kind: "event",
        title: text(event.summary, 200) ?? "(untitled event)",
        from: organizer,
        when: start,
        url: text(event.htmlLink, 500),
        excerpt:
          [
            text(event.description, 400),
            others.length
              ? `Attendees: ${others
                  .slice(0, 8)
                  .map((a) => text(a.displayName, 80) ?? text(a.email, 120))
                  .filter(Boolean)
                  .join(", ")}`
              : undefined,
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
        signals,
      },
    ]
  })
}

export function githubRecords(data: unknown, signal: string): ForYouRecord[] {
  return listIn(data, ["items", "issues", "results"]).flatMap(
    (issue): ForYouRecord[] => {
      const url = text(issue.html_url ?? issue.url, 500)
      const sourceId = url ?? text(issue.id, 100)
      if (!sourceId) return []
      const pull = !!issue.pull_request || /\/pull\/\d+/.test(url ?? "")
      const repo =
        text(issue.repository_url, 300)?.split("/repos/")[1] ??
        url?.match(/github\.com\/([^/]+\/[^/]+)/)?.[1]
      const signals = [signal]
      if (issue.draft === true) signals.push("draft")
      if (typeof issue.comments === "number" && issue.comments > 0)
        signals.push(`${issue.comments} comments`)
      const labels = asArray(issue.labels)
        .map((label) => text(label.name, 40))
        .filter(Boolean)
      if (labels.length)
        signals.push(`labels: ${labels.slice(0, 4).join(", ")}`)
      return [
        {
          id: `github:${sourceId}`,
          toolkit: "github",
          sourceId,
          kind: pull ? "pull_request" : "issue",
          title:
            `${repo ? `${repo}#${issue.number ?? ""} ` : ""}${text(issue.title, 200) ?? ""}`.trim(),
          from: text(get(issue, "user", "login"), 100),
          when: text(issue.updated_at, 60),
          url,
          excerpt: text(issue.body, 400),
          signals,
        },
      ]
    }
  )
}

function notionTitle(page: Record<string, unknown>) {
  const properties = get(page, "properties")
  if (properties && typeof properties === "object")
    for (const property of Object.values(properties)) {
      if (get(property, "type") !== "title") continue
      const parts = asArray(get(property, "title"))
        .map((part) => text(part.plain_text, 200))
        .join("")
      if (parts) return parts
    }
  return text(page.title, 200)
}

export function notionRecords(data: unknown): ForYouRecord[] {
  return listIn(data, ["results", "pages"]).flatMap((page): ForYouRecord[] => {
    const sourceId = text(page.id, 200)
    if (!sourceId || page.archived === true || page.in_trash === true) return []
    const title = notionTitle(page)
    if (!title) return []
    return [
      {
        id: `notion:${sourceId}`,
        toolkit: "notion",
        sourceId,
        kind: "page",
        title,
        when: text(page.last_edited_time, 60),
        url: text(page.url, 500),
        signals: ["recently edited"],
      },
    ]
  })
}

export function linearRecords(data: unknown): ForYouRecord[] {
  return listIn(data, ["issues", "nodes", "items"]).flatMap(
    (issue): ForYouRecord[] => {
      const sourceId = text(issue.id, 200)
      if (!sourceId) return []
      const state =
        text(get(issue, "state", "name"), 60) ?? text(issue.state, 60)
      if (state && /^(done|canceled|cancelled|duplicate)$/i.test(state))
        return []
      const signals = ["assigned to you"]
      if (state) signals.push(`state: ${state}`)
      const due = text(issue.dueDate ?? issue.due_date, 40)
      if (due) signals.push(`due ${due}`)
      if (
        typeof issue.priority === "number" &&
        issue.priority > 0 &&
        issue.priority <= 2
      )
        signals.push("high priority")
      return [
        {
          id: `linear:${sourceId}`,
          toolkit: "linear",
          sourceId,
          kind: "issue",
          title:
            `${text(issue.identifier, 30) ?? ""} ${text(issue.title, 200) ?? ""}`.trim(),
          when: text(issue.updatedAt ?? issue.updated_at, 60),
          url: text(issue.url, 500),
          excerpt: text(issue.description, 400),
          signals,
        },
      ]
    }
  )
}

export function jiraRecords(data: unknown): ForYouRecord[] {
  return listIn(data, ["issues"]).flatMap((issue): ForYouRecord[] => {
    const sourceId = text(issue.key ?? issue.id, 100)
    if (!sourceId) return []
    const fields = (issue.fields ?? {}) as Record<string, unknown>
    const signals = ["assigned to you"]
    const status = text(get(fields, "status", "name"), 60)
    if (status) signals.push(`status: ${status}`)
    const due = text(fields.duedate, 40)
    if (due) signals.push(`due ${due}`)
    const priority = text(get(fields, "priority", "name"), 40)
    if (priority) signals.push(`priority: ${priority}`)
    return [
      {
        id: `jira:${sourceId}`,
        toolkit: "jira",
        sourceId,
        kind: "issue",
        title: `${sourceId} ${text(fields.summary, 200) ?? ""}`.trim(),
        when: text(fields.updated, 60),
        excerpt: text(fields.description, 400),
        signals,
      },
    ]
  })
}

const genericIdKey =
  /^(?:id|message_?id|thread_?id|issue_?id|record_?id|document_?id|file_?id|uid|key|url|html_url|web_url)$/i
const genericTitleKey = /^(?:name|title|subject|summary)$/i
const genericTextKey =
  /^(?:snippet|preview|description|text|plain_?text|content|body|message_?text|state|status)$/i
const genericFromKey = /^(?:sender|from|author|creator|owner|user|username)$/i
const genericWhenKey =
  /^(?:date|start|end|due_?date|created_?at|updated_?at|modified_?time|timestamp|ts|message_?timestamp)$/i
const genericUrlKey = /^(?:url|html_url|web_url|link|permalink|display_url)$/i

// Any app without a dedicated reader: keep small records that have an ID and
// readable text, and never mix a child record's text into its parent.
export function genericRecords(toolkit: string, data: unknown): ForYouRecord[] {
  const records = new Map<string, ForYouRecord>()
  function visit(value: unknown, depth: number) {
    if (!value || typeof value !== "object" || depth > 8 || records.size >= 25)
      return
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, depth + 1)
      return
    }
    const entries = Object.entries(value)
    const idEntry = entries.find(
      ([key, id]) =>
        genericIdKey.test(key) &&
        (typeof id === "string" || typeof id === "number") &&
        String(id).length <= 500
    )
    let title: string | undefined
    let from: string | undefined
    let when: string | undefined
    let url: string | undefined
    const excerpt: string[] = []
    for (const [key, field] of entries) {
      if (genericTitleKey.test(key)) title ??= text(field, 200)
      else if (genericFromKey.test(key))
        from ??=
          text(field, 120) ??
          text(get(field, "name"), 120) ??
          text(get(field, "login"), 120)
      else if (genericWhenKey.test(key)) when ??= text(field, 60)
      else if (genericTextKey.test(key)) {
        const value = text(field, 400)
        if (value) excerpt.push(value)
      }
      if (genericUrlKey.test(key)) url ??= text(field, 500)
    }
    if (idEntry && (title || excerpt.length)) {
      const sourceId = String(idEntry[1])
      records.set(sourceId, {
        id: `${toolkit}:${sourceId}`,
        toolkit,
        sourceId,
        kind: "item",
        title: title ?? excerpt[0].slice(0, 120),
        from,
        when,
        url: url?.startsWith("http") ? url : undefined,
        excerpt: excerpt.join(" · ").slice(0, MAX_TEXT) || undefined,
        signals: [],
      })
    }
    for (const [, nested] of entries) visit(nested, depth + 1)
  }
  visit(data, 0)
  return [...records.values()]
}

// Everything a quote may be copied from
export function recordText(record: ForYouRecord) {
  return [record.title, record.from, record.excerpt].filter(Boolean).join("\n")
}

function normalizeQuote(value: string) {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

// A candidate counts only when it points at a record that was really read and
// quotes it verbatim; everything else is the model's invention.
export function isGrounded(
  candidate: ForYouCandidate,
  records: ForYouRecord[]
) {
  const record = records.find((entry) => entry.id === candidate.recordId)
  if (!record) return undefined
  return normalizeQuote(recordText(record)).includes(
    normalizeQuote(candidate.quote)
  )
    ? record
    : undefined
}

export type ForYouFeedback = {
  // Fingerprints the person already started, dismissed, or snoozed
  excluded: Set<string>
  started: Partial<Record<ForYouCategory, number>>
  dismissed: Partial<Record<ForYouCategory, number>>
}

const urgencyWeight: Record<ForYouUrgency, number> = {
  today: 1,
  this_week: 0.6,
  later: 0.25,
}

// Deterministic and testable: urgency, the model's importance judgment, and
// what this person has acted on or dismissed before.
export function scoreCandidate(
  candidate: Pick<ForYouCandidate, "category" | "urgency" | "importance">,
  record: Pick<ForYouRecord, "signals">,
  feedback: Pick<ForYouFeedback, "started" | "dismissed">
) {
  const started = feedback.started[candidate.category] ?? 0
  const dismissed = feedback.dismissed[candidate.category] ?? 0
  // Beta(1,1)-smoothed acceptance rate for this kind of task
  const acceptance = (started + 1) / (started + dismissed + 2)
  let score =
    0.35 * urgencyWeight[candidate.urgency] +
    0.4 * (candidate.importance / 5) +
    0.25 * acceptance
  if (record.signals.includes("likely automated or bulk mail")) score -= 0.2
  if (record.signals.includes("you already replied in this thread"))
    score -= 0.15
  if (
    record.signals.some((signal) =>
      /awaiting your RSVP|review is requested|marked important|starred|high priority/.test(
        signal
      )
    )
  )
    score += 0.08
  return Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000
}

export const MIN_SCORE = 0.42
export const MAX_ITEMS = 3

export type RankedCandidate = ForYouCandidate & {
  record: ForYouRecord
  score: number
}

export function rankCandidates(
  candidates: ForYouCandidate[],
  records: ForYouRecord[],
  bots: { id: string }[],
  feedback: ForYouFeedback
): RankedCandidate[] {
  const seen = new Set<string>()
  const ranked: RankedCandidate[] = []
  for (const candidate of candidates) {
    const record = isGrounded(candidate, records)
    if (
      !record ||
      seen.has(record.id) ||
      feedback.excluded.has(record.id) ||
      !bots.some((bot) => bot.id === candidate.botId)
    )
      continue
    seen.add(record.id)
    ranked.push({
      ...candidate,
      record,
      score: scoreCandidate(candidate, record, feedback),
    })
  }
  return ranked
    .filter((candidate) => candidate.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ITEMS)
}

const appNames: Record<string, string> = {
  gmail: "Gmail",
  googlecalendar: "Google Calendar",
  github: "GitHub",
  notion: "Notion",
  linear: "Linear",
  jira: "Jira",
  slack: "Slack",
  memory: "Memory",
}

export function appName(toolkit: string) {
  return (
    appNames[toolkit] ??
    toolkit.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  )
}

function senderName(from: string) {
  return (
    from
      .replace(/<[^>]*>/g, "")
      .replace(/"/g, "")
      .trim() || from
  )
}

// Short, human description of where a card came from
export function sourceLabel(record: ForYouRecord, timeZone = "UTC") {
  const when = record.when ? new Date(record.when) : undefined
  const time =
    when && !Number.isNaN(when.getTime())
      ? when.toLocaleString("en-US", {
          timeZone,
          weekday: "short",
          ...(record.kind === "event" && record.signals.includes("all-day")
            ? {}
            : { hour: "numeric", minute: "2-digit" }),
        })
      : undefined
  switch (record.kind) {
    case "email":
      return `Email from ${senderName(record.from ?? "unknown sender")}`
    case "event":
      return time ? `Meeting ${time}` : "Upcoming meeting"
    case "pull_request":
      return `Pull request ${record.title.split(" ")[0]}`
    case "issue":
      return `Issue ${record.title.split(" ")[0]}`
    case "page":
      return `${appName(record.toolkit)} page`
    case "commitment":
      return time ? `You committed, due ${time}` : "Something you committed to"
    default:
      return appName(record.toolkit)
  }
}
