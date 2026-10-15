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

import { containsSecret } from "@/lib/memory-policy"

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
    // Server-owned lifecycle and sidebar preferences.
    setupComplete: boolean().notNull().default(true),
    pinnedAt: timestamp({ withTimezone: true }),
    // E2B desktop sandbox ID, preserved across pause/resume
    sandboxId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("bots_user_id_idx").on(table.userId)]
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
    expiresAt: timestamp({ withTimezone: true }).notNull(),
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

export const userSettings = pgTable("user_settings", {
  userId: text().primaryKey(),
  memoryEnabled: boolean().notNull().default(true),
  learnFromChats: boolean().notNull().default(true),
  proactivity: text({ enum: ["off", "digest", "nudges"] })
    .notNull()
    .default("digest"),
  timezone: text().notNull().default("UTC"),
  digestHour: integer().notNull().default(8),
  quietHours: jsonb().$type<{ start: number; end: number }>(),
  // Null means every connected app
  suggestionApps: text().array(),
  behavior: jsonb().$type<BehaviorAggregate>(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
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

export type Memory = typeof memories.$inferSelect
export type MemoryKind = (typeof memoryKind.enumValues)[number]
export type MemoryUpdate = z.infer<typeof memoryUpdateSchema>
export type AboutYou = z.infer<typeof aboutYouSchema>
export type MemorySettings = z.infer<typeof memorySettingsSchema>
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
