import { relations } from "drizzle-orm"
import {
  index,
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  real,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core"
import { createInsertSchema } from "drizzle-zod"
import { nanoid } from "nanoid"
import { z } from "zod"

import { featureIds } from "@/lib/feature-votes"
import { containsSecret } from "@/lib/memory-policy"
import {
  routineScheduleSchema,
  timeZoneSchema,
  type RoutineSchedule,
} from "@/lib/routine-policy"
import { isTaskBudget } from "@/lib/turn-spend"

export const bots = pgTable(
  "bots",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => nanoid()),
    // Clerk user ID
    userId: text().notNull(),
    name: text().notNull(),
    // Seed for the bot's face
    avatar: text()
      .notNull()
      .$defaultFn(() => nanoid()),
    // What the bot is for, in a phrase
    job: text().notNull(),
    // How it should go about the job
    instructions: text(),
    // The most one task may spend of the AI allowance, in millionths of a
    // dollar (TASK_BUDGETS in lib/turn-spend.ts). Null means no limit.
    taskBudget: integer(),
    // Server-owned lifecycle and sidebar preferences.
    setupComplete: boolean().notNull().default(true),
    pinnedAt: timestamp({ withTimezone: true }),
    // E2B desktop sandbox ID, preserved across pause/resume
    sandboxId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("bots_user_id_idx").on(table.userId),
    // Metering looks bots up by their computer
    index("bots_sandbox_id_idx").on(table.sandboxId),
  ]
)

export const chatKind = pgEnum("chat_kind", ["direct", "group"])

export const sidebarPreferences = pgTable("sidebar_preferences", {
  userId: text().primaryKey(),
  conversationOrder: text().array().notNull().default([]),
})

export const chats = pgTable(
  "chats",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => nanoid()),
    // Clerk user ID
    userId: text().notNull(),
    kind: chatKind().notNull().default("direct"),
    // Null for direct chats, which use the bot's name
    name: text(),
    lastMessagePreview: text(),
    // "off" is a temporary chat: memory is neither read nor written
    memoryMode: text({ enum: ["on", "off"] })
      .notNull()
      .default("on"),
    lastMessageAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("chats_user_id_idx").on(table.userId)]
)

// The AES-256 key (base64url) that seals what a chat sends through Trigger.dev
// (lib/chat-content-seal.ts), made on first send (lib/chat-content-key.ts).
// Stored only here and cascading with the chat, so deleting the chat leaves
// Trigger.dev's copies unreadable. Its own table so no chat query returns it.
export const chatContentKeys = pgTable("chat_content_keys", {
  chatId: text()
    .primaryKey()
    .references(() => chats.id, { onDelete: "cascade" }),
  key: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

// The chat agent's transcript (lib/chat-transcript-storage.ts), one document
// per chat, so conversation history lives here instead of in Trigger.dev's
// transcript snapshot and goes with the chat. `entries` and `state` are the
// runtime's opaque transcript ({ id, final, message }[] and its bookkeeping).
export const chatTranscripts = pgTable("chat_transcripts", {
  chatId: text()
    .primaryKey()
    .references(() => chats.id, { onDelete: "cascade" }),
  entries: jsonb().$type<unknown[]>().notNull(),
  state: jsonb(),
  cursors: jsonb().$type<{ lastOutEventId?: string; lastInEventId?: string }>(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export const chatMembers = pgTable(
  "chat_members",
  {
    chatId: text()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    botId: text()
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    joinedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.chatId, table.botId] }),
    index("chat_members_bot_id_idx").on(table.botId),
  ]
)

// One report per owner/message. Chat and account deletion remove the report,
// including the server-captured text, through the chat's cascading foreign key.
export const aiContentReports = pgTable(
  "ai_content_reports",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text().notNull(),
    chatId: text()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    messageId: text().notNull(),
    reason: text({
      enum: ["offensive", "unsafe", "inaccurate", "other"],
    }).notNull(),
    details: text(),
    // Only assistant text, never tool arguments/results or the whole transcript.
    messageText: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("ai_content_reports_user_message_idx").on(
      table.userId,
      table.chatId,
      table.messageId
    ),
    index("ai_content_reports_chat_id_idx").on(table.chatId),
    index("ai_content_reports_reviewed_created_idx").on(
      table.reviewedAt,
      table.createdAt
    ),
  ]
)

export const aiContentReportSchema = createInsertSchema(aiContentReports, {
  details: z
    .string()
    .trim()
    .max(1000, "Keep your report under 1,001 characters.")
    .optional(),
})
  .pick({ reason: true, details: true })
  .strict()
export type AIContentReportInput = z.infer<typeof aiContentReportSchema>

export const usageKind = pgEnum("usage_kind", ["ai", "sandbox"])

// The usage ledger: one row per metered event, only ever added to. What a user
// has used in a billing period is the sum of their rows since it started.
export const usageEntries = pgTable(
  "usage_entries",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => nanoid()),
    // Clerk user ID
    userId: text().notNull(),
    kind: usageKind().notNull(),
    // Millionths of a dollar of model spend for "ai", seconds a sandbox was
    // running for "sandbox"
    amount: integer().notNull(),
    // Names the event that was metered, so writing it twice counts it once
    idempotencyKey: text().notNull().unique(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("usage_entries_user_id_created_at_idx").on(
      table.userId,
      table.createdAt
    ),
  ]
)

// One row per E2B running session. Paused time never contributes to usage.
export const sandboxSessions = pgTable("sandbox_sessions", {
  id: text().primaryKey(),
  sandboxId: text().notNull(),
  userId: text().notNull(),
  startedAt: timestamp({ withTimezone: true }).notNull(),
  endAt: timestamp({ withTimezone: true }).notNull(),
  meteredSeconds: integer().notNull().default(0),
})

// The person's one E2B computer, shared by all their bots. A turn holds the
// lease while it uses the computer, so bots take turns; it lapses two minutes
// after the turn's last computer call (lib/computer-lease-policy.ts).
export const computers = pgTable("computers", {
  // Clerk user ID
  userId: text().primaryKey(),
  // E2B desktop sandbox ID, preserved across pause/resume. Metering and orphan
  // cleanup find the owner through it.
  sandboxId: text().unique(),
  leaseBotId: text().references(() => bots.id, { onDelete: "set null" }),
  leaseChatId: text().references(() => chats.id, { onDelete: "set null" }),
  // The holding turn's ledger key, ai:<runId>:<turn>
  leaseRunKey: text(),
  leaseExpiresAt: timestamp({ withTimezone: true }),
  // Last lease taken or renewed; free-plan computers idle 30 days are deleted
  lastUsedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

// Identity survives disconnecting plan usage, so ChatGPT remains a sign-in method.
// Credentials are encrypted server-side and never returned by dashboard queries.
export const chatgptConnections = pgTable(
  "chatgpt_connections",
  {
    userId: text().primaryKey(),
    issuer: text().notNull(),
    clientId: text().notNull(),
    subject: text().notNull(),
    email: text(),
    name: text(),
    accessToken: text(),
    refreshToken: text(),
    expiresAt: timestamp({ withTimezone: true }),
    scopes: text().array().notNull().default([]),
    enabled: boolean().notNull().default(false),
    model: text(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("chatgpt_identity_idx").on(
      table.issuer,
      table.clientId,
      table.subject
    ),
  ]
)

// State and the browser binding are hashed. The PKCE verifier stays encrypted.
export const chatgptAuthAttempts = pgTable(
  "chatgpt_auth_attempts",
  {
    id: text().primaryKey(),
    browserHash: text().notNull(),
    payload: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [index("chatgpt_auth_expiry_idx").on(table.expiresAt)]
)

// A native app's pending app connection. The web keeps this in a cookie; the
// native app has no browser cookie, so the attempt is bound to the user here.
export const connectorAuthAttempts = pgTable(
  "connector_auth_attempts",
  {
    state: text().primaryKey(),
    userId: text().notNull(),
    accountId: text().notNull(),
    toolkit: text().notNull(),
    returnUrl: text().notNull(),
    // Set when the connect card in a chat started it: completing the
    // connection wakes `botId` there and answers the card (`questionId`)
    chatId: text(),
    questionId: text(),
    botId: text(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    // Set once the attempt is verified, with what completing it returned, so
    // a retried completion (a lost response) gets the same answer again
    completedAt: timestamp({ withTimezone: true }),
    completion: jsonb().$type<{
      connected: boolean
      woke?: boolean
      inputSeq?: number
    }>(),
  },
  (table) => [index("connector_auth_expiry_idx").on(table.expiresAt)]
)

export const chatgptPreferenceSchema = createInsertSchema(chatgptConnections, {
  enabled: z.boolean(),
  model: z.string().trim().min(1).max(200).nullable(),
})
  .pick({ enabled: true, model: true })
  .required()
export type ChatGPTPreference = z.infer<typeof chatgptPreferenceSchema>

export const memoryKind = pgEnum("memory_kind", [
  "profile",
  "preference",
  "person",
  "project",
  "procedure",
  "commitment",
  "insight",
])
export const memoryStatus = pgEnum("memory_status", [
  "active",
  "suggested",
  "stale",
])
export const memorySource = pgEnum("memory_source", [
  "explicit",
  "extracted",
  "user_edit",
  "reflection",
  "setup",
])

// What the person's teammates know about them. A row is never edited in place:
// a change supersedes it, so the old version stays as history.
export const memories = pgTable(
  "memories",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => nanoid()),
    // Clerk user ID
    userId: text().notNull(),
    // Null means every teammate sees it
    botId: text().references(() => bots.id, { onDelete: "cascade" }),
    kind: memoryKind().notNull(),
    status: memoryStatus().notNull().default("active"),
    // One sentence, at most 300 characters
    content: text().notNull(),
    embedding: vector({ dimensions: 1024 }).notNull(),
    // 1-10, set when written
    importance: integer().notNull(),
    confidence: real().notNull().default(0.7),
    // Always in the core block
    pinned: boolean().notNull().default(false),
    sensitivity: text({ enum: ["normal", "sensitive"] })
      .notNull()
      .default("normal"),
    source: memorySource().notNull(),
    sourceChatId: text().references(() => chats.id, { onDelete: "set null" }),
    evidenceQuote: text(),
    validFrom: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Set when superseded or expired
    invalidAt: timestamp({ withTimezone: true }),
    supersededById: text(),
    // Commitments
    dueAt: timestamp({ withTimezone: true }),
    reinforcedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    reinforceCount: integer().notNull().default(0),
    // Bumped when injected or recalled
    lastUsedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("memories_user_id_invalid_at_idx").on(table.userId, table.invalidAt),
    index("memories_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
  ]
)

// Audit trail, and the history the memory page shows
export const memoryEvents = pgTable(
  "memory_events",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => nanoid()),
    memoryId: text()
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    userId: text().notNull(),
    action: text({
      enum: ["add", "reinforce", "supersede", "edit", "expire", "confirm"],
    }).notNull(),
    before: text(),
    after: text(),
    actor: text({
      enum: ["user", "agent", "extractor", "maintenance"],
    }).notNull(),
    chatId: text(),
    runId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("memory_events_memory_id_idx").on(table.memoryId)]
)

// Nightly aggregates of user_signals; filled in by later phases
export type BehaviorAggregate = Record<string, unknown>

export type AppPreferences = Record<string, { proactive?: boolean }>

export const userSettings = pgTable("user_settings", {
  userId: text().primaryKey(),
  memoryEnabled: boolean().notNull().default(true),
  learnFromChats: boolean().notNull().default(true),
  proactivity: text({ enum: ["off", "digest", "nudges"] })
    .notNull()
    .default("digest"),
  timezone: text().notNull().default("UTC"),
  digestHour: integer().notNull().default(8),
  // A push at digestHour, in their timezone, with what their bots did since
  // the last one (trigger/morning-summary.ts)
  morningSummary: boolean().notNull().default(true),
  lastSummaryAt: timestamp({ withTimezone: true }),
  quietHours: jsonb().$type<{ start: number; end: number }>(),
  // Null means every connected app
  suggestionApps: text().array(),
  // Per toolkit; `proactive: false` keeps For you away from the app
  appPreferences: jsonb().$type<AppPreferences>(),
  behavior: jsonb().$type<BehaviorAggregate>(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export const forYouCategory = pgEnum("for_you_category", [
  "reply",
  "meeting_prep",
  "review",
  "issue",
  "doc_followup",
  "commitment",
  "other",
  // Answer an invite, find a time, or move a meeting
  "schedule",
  // Nudge someone who hasn't answered the person's own email
  "follow_up",
  // Bills, renewals, forms, deadlines and other errands
  "admin",
])
export const forYouUrgency = pgEnum("for_you_urgency", [
  "today",
  "this_week",
  "later",
])
export const forYouState = pgEnum("for_you_state", [
  "new",
  "started",
  "dismissed",
  "snoozed",
])

// Suggested tasks found in the person's connected apps and memory. Rows the
// person acted on stay, so the same record is never suggested twice.
export const forYouItems = pgTable(
  "for_you_items",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => nanoid()),
    // Clerk user ID
    userId: text().notNull(),
    botId: text()
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    // `${toolkit}:${sourceId}`, or `memory:${memoryId}` for a commitment
    fingerprint: text().notNull(),
    title: text().notNull(),
    // Why this is worth doing, shown on the card
    reason: text().notNull(),
    prompt: text().notNull(),
    category: forYouCategory().notNull(),
    urgency: forYouUrgency().notNull(),
    score: real().notNull(),
    // Null for memory-sourced items
    toolkit: text(),
    accountId: text(),
    sourceId: text().notNull(),
    // Verbatim text from the record or the person's own words
    sourceQuote: text().notNull(),
    // "Email from Dana Kim", "Meeting tomorrow 10:00"
    sourceLabel: text().notNull(),
    sourceUrl: text(),
    state: forYouState().notNull().default("new"),
    dismissReason: text({ enum: ["not_relevant", "done", "wrong_bot"] }),
    snoozedUntil: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    chatId: text(),
    actedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("for_you_items_user_fingerprint_idx").on(
      table.userId,
      table.fingerprint
    ),
    index("for_you_items_user_state_idx").on(table.userId, table.state),
  ]
)

// The latest scan per person: drives staleness, "Checked Gmail · 5m ago", and
// keeps two tabs from scanning at once.
export const forYouScans = pgTable("for_you_scans", {
  userId: text().primaryKey(),
  status: text({ enum: ["running", "done", "failed"] }).notNull(),
  // Apps read successfully, and apps that failed, in the latest scan
  checked: text().array().notNull().default([]),
  failed: text().array().notNull().default([]),
  error: text(),
  startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp({ withTimezone: true }),
})

// Work a bot does on its own schedule. Each run posts the prompt into the
// routine's chat as an unattended turn; the cron in trigger/routines.ts claims
// due rows by nextRunAt.
export const routines = pgTable(
  "routines",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => nanoid()),
    // Clerk user ID
    userId: text().notNull(),
    botId: text()
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    // Where each run reports. A direct chat with the bot, or a group it is in.
    chatId: text()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    title: text().notNull(),
    prompt: text().notNull(),
    schedule: jsonb().$type<RoutineSchedule>().notNull(),
    // IANA zone the schedule's clock times are read in
    timezone: text().notNull(),
    enabled: boolean().notNull().default(true),
    // Null once a one-off routine has run, or while it is paused
    nextRunAt: timestamp({ withTimezone: true }),
    lastRunAt: timestamp({ withTimezone: true }),
    // started: posted into the chat. completed, blocked (stopped for an
    // approval or a question) and failed come back from the run's turn.
    lastStatus: text({
      enum: ["started", "skipped", "failed", "completed", "blocked"],
    }),
    lastError: text(),
    // An event routine's Composio trigger and the connected account it
    // watches (lib/routine-events.ts). Server-owned.
    triggerId: text(),
    triggerAccountId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("routines_user_id_idx").on(table.userId),
    index("routines_due_idx").on(table.enabled, table.nextRunAt),
  ]
)

// One row per run of a routine, newest first on the Activity page. Keyed by
// the run's message ID (routineRunMessageId), so a retried dispatch or a
// repeated report writes the same row. Cascades with its routine.
// Webhook deliveries already turned into runs, by Composio's webhook ID, so
// a redelivered event starts at most one run. Cascades with its routine.
export const routineEvents = pgTable("routine_events", {
  id: text().primaryKey(),
  routineId: text()
    .notNull()
    .references(() => routines.id, { onDelete: "cascade" }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export const routineRuns = pgTable(
  "routine_runs",
  {
    id: text().primaryKey(),
    routineId: text()
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    // Clerk user ID
    userId: text().notNull(),
    scheduledAt: timestamp({ withTimezone: true }).notNull(),
    status: text({
      enum: ["started", "skipped", "failed", "completed", "blocked"],
    }).notNull(),
    detail: text(),
    // AI allowance the run's turns used, net of credits, in millionths of a
    // dollar, and the turn keys already counted in it
    spent: integer().notNull().default(0),
    spentKeys: text().array().notNull().default([]),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("routine_runs_routine_idx").on(table.routineId, table.scheduledAt),
    index("routine_runs_user_idx").on(table.userId, table.scheduledAt),
  ]
)

export const approvalState = pgEnum("approval_state", [
  "pending",
  "approved",
  "denied",
  "expired",
  // Claimed by runApprovedAction; a row left here never confirmed an outcome
  "running",
  "executed",
  "failed",
])

// What an approval holds: a connected-app call, or a committing action on the
// account computer (a click or key that sends, posts, submits, deletes or buys)
export const approvalKind = pgEnum("approval_kind", ["app", "computer"])

// An external action a bot wants to take, held until its owner decides. The
// stored call is what runs on approval; the model can't change it afterwards.
export const approvals = pgTable(
  "approvals",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => nanoid()),
    // Clerk user ID
    userId: text().notNull(),
    botId: text()
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    chatId: text()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    kind: approvalKind().notNull().default("app"),
    // Computer approvals fill the app columns with sentinels: toolkit
    // "computer", toolSlug COMPUTER_<ACTION>, accountId "computer"
    toolkit: text().notNull(),
    toolSlug: text().notNull(),
    accountId: text().notNull(),
    arguments: jsonb().$type<Record<string, unknown>>().notNull(),
    // One sentence, in the bot's words, of what will happen
    summary: text().notNull(),
    // Computer approvals only: the site and the kind of committing action
    // (submit, post, send, delete, buy; apps treat other values as generic)
    hostname: text(),
    action: text(),
    // The server's screenshot when the bot asked, so the owner sees what the
    // step acts on. Base64 PNG; dropped when too large.
    preview: text(),
    // Computer approvals: when the first gesture spent it, and how many
    // checked gestures it has covered (lib/computer-approval-policy.ts)
    claimedAt: timestamp({ withTimezone: true }),
    uses: integer().notNull().default(0),
    state: approvalState().notNull().default("pending"),
    result: jsonb(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    // The message that started the task that asked: a routine run's ID when a
    // routine asked, so the run's status follows the approval
    originMessageId: text(),
    // The reply that asked: app approvals from one reply are decided together
    // and wake the bot once (lib/approvals.ts)
    batchId: text(),
    decidedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("approvals_user_state_idx").on(table.userId, table.state),
    index("approvals_user_batch_idx").on(table.userId, table.batchId),
  ]
)

// "Always allow": an app action this bot may take without asking again.
// Bound to the connected account it was granted for; a rule for another
// account, or for a high-risk action, is never applied (lib/approval-policy.ts).
export const approvalRules = pgTable(
  "approval_rules",
  {
    userId: text().notNull(),
    botId: text()
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    toolSlug: text().notNull(),
    // Null on rules saved before rules were bound to an account; never applied
    accountId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.botId, table.toolSlug] })]
)

export const activityKind = pgEnum("activity_kind", [
  "routine_started",
  "routine_skipped",
  "routine_failed",
  "approval_requested",
  "approval_decided",
  "question_asked",
  "work_finished",
  "work_failed",
])

// What the person's bots did while nobody was watching, newest first
export const activityEvents = pgTable(
  "activity_events",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => nanoid()),
    // Clerk user ID
    userId: text().notNull(),
    botId: text().references(() => bots.id, { onDelete: "set null" }),
    chatId: text().references(() => chats.id, { onDelete: "set null" }),
    kind: activityKind().notNull(),
    title: text().notNull(),
    detail: text(),
    // Names the event, so a retried task records it once
    dedupeKey: text().unique(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("activity_events_user_created_idx").on(table.userId, table.createdAt),
  ]
)

// Expo push tokens for the person's phones
export const pushDevices = pgTable(
  "push_devices",
  {
    token: text().primaryKey(),
    // Clerk user ID
    userId: text().notNull(),
    platform: text({ enum: ["ios", "android"] }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("push_devices_user_id_idx").on(table.userId)]
)

// A message for the person, shown as a banner on the web workspace and the
// app's home screen until they dismiss it
export const notices = pgTable(
  "notices",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => nanoid()),
    // Clerk user ID
    userId: text().notNull(),
    title: text().notNull(),
    body: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    dismissedAt: timestamp({ withTimezone: true }),
  },
  (table) => [index("notices_user_id_idx").on(table.userId)]
)

// Sign in with Apple refresh tokens, one per Apple client (the iOS bundle ID),
// kept only so account deletion can revoke the grant with Apple. The token is
// AES-256-GCM encrypted, bound to the owner and client (lib/apple-signin.ts).
export const appleSignInGrants = pgTable(
  "apple_sign_in_grants",
  {
    // Clerk user ID
    userId: text().notNull(),
    clientId: text().notNull(),
    // Apple's stable user ID (the ID token's `sub`)
    subject: text().notNull(),
    refreshToken: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.clientId] })]
)

// AI spend a turn has made but not yet written to the ledger. getUsage counts
// it, so parallel turns see each other; a sweep books abandoned holds.
export const usageHolds = pgTable(
  "usage_holds",
  {
    // The usage entry's idempotency key this hold becomes
    idempotencyKey: text().primaryKey(),
    userId: text().notNull(),
    amount: integer().notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("usage_holds_user_id_idx").on(table.userId)]
)

// The last plan read from Clerk Billing, so hot paths don't call Clerk each time
export const accountPlans = pgTable("account_plans", {
  userId: text().primaryKey(),
  tier: text({ enum: ["free", "paid"] }).notNull(),
  periodStart: timestamp({ withTimezone: true }),
  periodEnd: timestamp({ withTimezone: true }),
  checkedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export const botsRelations = relations(bots, ({ many }) => ({
  memberships: many(chatMembers),
}))

export const chatsRelations = relations(chats, ({ many }) => ({
  members: many(chatMembers),
}))

export const chatMembersRelations = relations(chatMembers, ({ one }) => ({
  chat: one(chats, {
    fields: [chatMembers.chatId],
    references: [chats.id],
  }),
  bot: one(bots, {
    fields: [chatMembers.botId],
    references: [bots.id],
  }),
}))

// What a user may submit; userId comes from the session, the rest is generated
export const botInsertSchema = createInsertSchema(bots, {
  name: (schema) =>
    schema
      .trim()
      .min(1, "Give your bot a name.")
      .max(50, "Keep it under 50 characters."),
  job: (schema) =>
    schema
      .trim()
      .min(1, "Tell your bot what its job is.")
      .max(100, "Keep it under 100 characters."),
  instructions: (schema) =>
    schema.trim().max(4000, "Keep it under 4000 characters."),
  // Optional, so clients that don't know about it leave it unchanged
  taskBudget: (schema) =>
    schema
      .refine((value) => isTaskBudget(value), "Pick one of the listed limits.")
      .optional(),
}).omit({
  id: true,
  userId: true,
  sandboxId: true,
  createdAt: true,
  setupComplete: true,
  pinnedAt: true,
})

// A group chat is a name and the bots in it; direct chats are made with their bot
export const groupChatInsertSchema = createInsertSchema(chats, {
  name: z
    .string()
    .trim()
    .min(1, "Give the group a name.")
    .max(50, "Keep it under 50 characters."),
})
  .omit({
    id: true,
    userId: true,
    kind: true,
    memoryMode: true,
    lastMessagePreview: true,
    lastMessageAt: true,
    createdAt: true,
  })
  .extend({
    botIds: z
      .array(z.string().min(1))
      .min(2, "Pick at least two bots.")
      .max(8, "Pick up to eight bots.")
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Pick different bots."
      ),
  })

const memoryContent = (schema: z.ZodString) =>
  schema
    .trim()
    .min(1, "Write the memory.")
    .max(300, "Keep it under 300 characters.")
    .refine(
      (content) => !containsSecret(content),
      "This looks like a password, key or card number. Memories can't hold secrets."
    )

// What the memory page may change about one memory; the ID is passed apart
export const memoryUpdateSchema = createInsertSchema(memories, {
  content: memoryContent,
  botId: z.string().min(1).nullable(),
})
  .pick({ content: true, kind: true, botId: true, pinned: true })
  .required()

const aboutField = z
  .string()
  .trim()
  .max(200, "Keep it under 200 characters.")
  .refine(
    (value) => !containsSecret(value),
    "This looks like a password, key or card number."
  )

// "About you": a few profile and preference memories, plus the timezone setting
export const aboutYouSchema = createInsertSchema(userSettings, {
  timezone: (schema) =>
    schema
      .trim()
      .max(64)
      .refine(
        (zone) => !zone || Intl.supportedValuesOf("timeZone").includes(zone),
        "Pick a timezone from the list."
      ),
})
  .pick({ timezone: true })
  .required()
  .extend({
    role: aboutField,
    workingHours: aboutField,
    answerStyle: aboutField,
    about: aboutField.max(300, "Keep it under 300 characters."),
  })

export const memorySettingsSchema = createInsertSchema(userSettings)
  .pick({ memoryEnabled: true })
  .required()

export const morningSummarySchema = createInsertSchema(userSettings)
  .pick({ morningSummary: true })
  .required()

export type Memory = typeof memories.$inferSelect
export type MemoryKind = (typeof memoryKind.enumValues)[number]
export type MemoryUpdate = z.infer<typeof memoryUpdateSchema>
export type AboutYou = z.infer<typeof aboutYouSchema>
export type MemorySettings = z.infer<typeof memorySettingsSchema>
export type MorningSummarySettings = z.infer<typeof morningSummarySchema>

const routineTitle = (schema: z.ZodString) =>
  schema
    .trim()
    .min(1, "Give the routine a name.")
    .max(60, "Keep it under 60 characters.")
const routinePrompt = (schema: z.ZodString) =>
  schema
    .trim()
    .min(1, "Tell the bot what to do each time.")
    .max(2000, "Keep it under 2000 characters.")

// A new routine. The chat it reports to is picked server-side from the bot.
export const routineInsertSchema = createInsertSchema(routines, {
  title: routineTitle,
  prompt: routinePrompt,
  schedule: routineScheduleSchema,
  timezone: timeZoneSchema,
})
  .pick({
    botId: true,
    title: true,
    prompt: true,
    schedule: true,
    timezone: true,
  })
  .required()
  .extend({ requestId: z.string().min(1).max(100) })

export const routineUpdateSchema = createInsertSchema(routines, {
  title: routineTitle,
  prompt: routinePrompt,
  schedule: routineScheduleSchema,
  timezone: timeZoneSchema,
})
  .pick({
    title: true,
    prompt: true,
    schedule: true,
    timezone: true,
    enabled: true,
  })
  .partial()

export const approvalDecisionSchema = z.object({
  decision: z.enum(["approve", "always", "deny"]),
})

// Every request still waiting from one reply at once
export const approvalBatchDecisionSchema = z.object({
  decision: z.enum(["approve", "deny"]),
})

// Removes one "Always allow" rule
export const approvalRuleRevokeSchema = createInsertSchema(approvalRules, {
  botId: z.string().trim().min(1).max(100),
  toolSlug: z.string().trim().min(1).max(200),
})
  .pick({ botId: true, toolSlug: true })
  .required()
export type ApprovalRuleRevoke = z.infer<typeof approvalRuleRevokeSchema>

export const pushDeviceSchema = createInsertSchema(pushDevices, {
  token: z
    .string()
    .trim()
    .regex(/^(Expo|Exponent)PushToken\[[^\]]{1,200}\]$/, "Invalid push token"),
}).pick({ token: true, platform: true })

export type Routine = typeof routines.$inferSelect
export type RoutineInsert = z.infer<typeof routineInsertSchema>
export type RoutineUpdate = z.infer<typeof routineUpdateSchema>
export type Approval = typeof approvals.$inferSelect
export type ApprovalDecision = z.infer<
  typeof approvalDecisionSchema
>["decision"]
export type ActivityEvent = typeof activityEvents.$inferSelect
export type Notice = typeof notices.$inferSelect
export type PushDevice = z.infer<typeof pushDeviceSchema>
export type UserSettings = typeof userSettings.$inferSelect

export type Bot = typeof bots.$inferSelect
export type NewBot = typeof bots.$inferInsert
export type BotInsert = z.infer<typeof botInsertSchema>

export type GroupChatInsert = z.infer<typeof groupChatInsertSchema>

export type Chat = typeof chats.$inferSelect
export type NewChat = typeof chats.$inferInsert
export type UsageKind = (typeof usageKind.enumValues)[number]
export type NewUsageEntry = typeof usageEntries.$inferInsert
export type ChatMember = typeof chatMembers.$inferSelect
export type NewChatMember = typeof chatMembers.$inferInsert
export type ForYouItem = typeof forYouItems.$inferSelect
export type ForYouCategory = (typeof forYouCategory.enumValues)[number]
export type ForYouUrgency = (typeof forYouUrgency.enumValues)[number]

// Public launch subscriptions, independent of Clerk accounts. No account IDs
// are collected; one row per email and platform makes retries idempotent.
export const appWaitlist = pgTable(
  "app_waitlist",
  {
    email: text().notNull(),
    platform: text({ enum: ["mac", "iphone"] }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.email, table.platform] })]
)

// Anonymous votes in the home page's "what should we build next" poll. The
// voter is a SHA-256 of a random cookie, never an account, so each browser has
// one vote it can move to another option.
export const featureVotes = pgTable(
  "feature_votes",
  {
    voterHash: text().primaryKey(),
    featureId: text({ enum: featureIds }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("feature_votes_feature_id_idx").on(table.featureId)]
)

export const featureVoteSchema = createInsertSchema(featureVotes)
  .pick({ featureId: true })
  .required()

export type FeatureVoteInput = z.infer<typeof featureVoteSchema>
