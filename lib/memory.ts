import { neon } from "@neon/ai-sdk-provider"
import { embed } from "ai"
import {
  and,
  asc,
  cosineDistance,
  count,
  eq,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm"

import { db } from "@/db"
import {
  chats,
  memories,
  memoryEvents,
  userSettings,
  type Memory,
  type MemoryKind,
} from "@/db/schema"
import {
  containsSecret,
  formatMemoryBlock,
  rankRecalled,
  RECALL_LIMIT,
  selectCore,
} from "@/lib/memory-policy"

// 1024 dimensions, matching memories.embedding
const embeddingModel = neon.embeddingModel("qwen3-embedding-0-6b")

export async function embedText(value: string) {
  const { embedding } = await embed({ model: embeddingModel, value })
  return embedding
}

// Everything but the vector, which nothing outside the database needs
const memoryColumns = {
  id: memories.id,
  userId: memories.userId,
  botId: memories.botId,
  kind: memories.kind,
  status: memories.status,
  content: memories.content,
  importance: memories.importance,
  confidence: memories.confidence,
  pinned: memories.pinned,
  sensitivity: memories.sensitivity,
  source: memories.source,
  sourceChatId: memories.sourceChatId,
  evidenceQuote: memories.evidenceQuote,
  validFrom: memories.validFrom,
  invalidAt: memories.invalidAt,
  supersededById: memories.supersededById,
  dueAt: memories.dueAt,
  reinforcedAt: memories.reinforcedAt,
  reinforceCount: memories.reinforceCount,
  lastUsedAt: memories.lastUsedAt,
  createdAt: memories.createdAt,
}
export type MemoryRow = Omit<Memory, "embedding">

export async function getUserSettings(userId: string) {
  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
  })
  return row ?? { userId, memoryEnabled: true, timezone: "UTC" }
}

// Off for the account, or a temporary chat: nothing is read or written
export async function isMemoryOn(userId: string, chatId?: string) {
  const [settings, chat] = await Promise.all([
    getUserSettings(userId),
    chatId
      ? db.query.chats.findFirst({
          where: eq(chats.id, chatId),
          columns: { memoryMode: true },
        })
      : undefined,
  ])
  return settings.memoryEnabled && chat?.memoryMode !== "off"
}

// Currently valid memories this teammate may see: shared ones and its own
function visibleTo(userId: string, botId?: string, includeSensitive = true) {
  return and(
    eq(memories.userId, userId),
    isNull(memories.invalidAt),
    eq(memories.status, "active"),
    botId
      ? or(isNull(memories.botId), eq(memories.botId, botId))
      : isNull(memories.botId),
    includeSensitive ? undefined : ne(memories.sensitivity, "sensitive")
  )
}

export async function countActiveMemories(userId: string) {
  const [row] = await db
    .select({ total: count() })
    .from(memories)
    .where(and(eq(memories.userId, userId), isNull(memories.invalidAt)))
  return row?.total ?? 0
}

export async function searchMemories({
  userId,
  botId,
  query,
  limit = RECALL_LIMIT,
  exclude,
  includeSensitive = true,
}: {
  userId: string
  botId?: string
  query: string
  limit?: number
  exclude?: Set<string>
  includeSensitive?: boolean
}) {
  const vector = await embedText(query)
  const distance = cosineDistance(memories.embedding, vector)
  // Over-fetch by vector alone, then re-score with recency and importance
  const rows = await db
    .select({ ...memoryColumns, cosine: sql<number>`1 - (${distance})` })
    .from(memories)
    .where(visibleTo(userId, botId, includeSensitive))
    .orderBy(asc(distance))
    .limit(40)
  return rankRecalled(
    rows.map((row) => ({ ...row, cosine: Number(row.cosine) })),
    { limit, exclude }
  )
}

// The <memory> block for one turn: the core block, plus what the latest
// message brings up. Returns the injected IDs so their use can be recorded.
export async function loadMemoryContext({
  userId,
  botId,
  query,
  includeSensitive = true,
}: {
  userId: string
  botId: string
  query: string
  includeSensitive?: boolean
}) {
  const rows = await db
    .select(memoryColumns)
    .from(memories)
    .where(visibleTo(userId, botId, includeSensitive))
  const core = selectCore(rows, botId)
  const recalled =
    rows.length > core.length && query.trim()
      ? await searchMemories({
          userId,
          botId,
          query: query.slice(0, 2000),
          exclude: new Set(core.map((row) => row.id)),
          includeSensitive,
        })
      : []
  return {
    block: formatMemoryBlock(core, recalled),
    ids: [...core, ...recalled].map((row) => row.id),
  }
}

export async function touchMemories(ids: string[]) {
  if (!ids.length) return
  await db
    .update(memories)
    .set({ lastUsedAt: new Date() })
    .where(inArray(memories.id, ids))
}

type Actor = (typeof memoryEvents.$inferInsert)["actor"]

export async function writeMemory(input: {
  userId: string
  botId: string | null
  kind: MemoryKind
  content: string
  importance: number
  source: Memory["source"]
  actor: Actor
  confidence?: number
  pinned?: boolean
  sensitivity?: Memory["sensitivity"]
  chatId?: string | null
  evidenceQuote?: string | null
  dueAt?: Date | null
}) {
  const content = input.content.trim()
  if (containsSecret(content))
    throw new Error(
      "That looks like a password, key or card number, which is never saved to memory."
    )
  const embedding = await embedText(content)
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(memories)
      .values({
        userId: input.userId,
        botId: input.botId,
        kind: input.kind,
        content,
        embedding,
        importance: Math.min(10, Math.max(1, Math.round(input.importance))),
        confidence: input.confidence ?? 0.7,
        pinned: input.pinned ?? false,
        sensitivity: input.sensitivity ?? "normal",
        source: input.source,
        sourceChatId: input.chatId ?? null,
        evidenceQuote: input.evidenceQuote ?? null,
        dueAt: input.dueAt ?? null,
      })
      .returning(memoryColumns)
    await tx.insert(memoryEvents).values({
      memoryId: row.id,
      userId: input.userId,
      action: "add",
      after: content,
      actor: input.actor,
      chatId: input.chatId ?? null,
    })
    return row
  })
}

export async function getValidMemory(userId: string, memoryId: string) {
  const [row] = await db
    .select(memoryColumns)
    .from(memories)
    .where(
      and(
        eq(memories.id, memoryId),
        eq(memories.userId, userId),
        isNull(memories.invalidAt)
      )
    )
  return row
}

// A change never edits the row: the old version is closed and points to the new
export async function supersedeMemory(input: {
  userId: string
  memoryId: string
  actor: Actor
  chatId?: string | null
  content?: string
  kind?: MemoryKind
  botId?: string | null
  pinned?: boolean
  source?: Memory["source"]
}) {
  const old = await getValidMemory(input.userId, input.memoryId)
  if (!old) throw new Error("That memory doesn't exist or was already changed.")
  const content = (input.content ?? old.content).trim()
  if (containsSecret(content))
    throw new Error(
      "That looks like a password, key or card number, which is never saved to memory."
    )
  const embedding =
    content === old.content
      ? (
          await db
            .select({ embedding: memories.embedding })
            .from(memories)
            .where(eq(memories.id, old.id))
        )[0].embedding
      : await embedText(content)
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(memories)
      .values({
        userId: old.userId,
        botId: input.botId === undefined ? old.botId : input.botId,
        kind: input.kind ?? old.kind,
        status: old.status,
        content,
        embedding,
        importance: old.importance,
        confidence: input.actor === "user" ? 1 : old.confidence,
        pinned: input.pinned ?? old.pinned,
        sensitivity: old.sensitivity,
        source: input.source ?? old.source,
        sourceChatId: input.chatId ?? old.sourceChatId,
        evidenceQuote: old.evidenceQuote,
        dueAt: old.dueAt,
        reinforceCount: old.reinforceCount,
      })
      .returning(memoryColumns)
    const [closed] = await tx
      .update(memories)
      .set({ invalidAt: new Date(), supersededById: row.id })
      .where(and(eq(memories.id, old.id), isNull(memories.invalidAt)))
      .returning({ id: memories.id })
    // Another change got there first; this transaction's insert is rolled back
    if (!closed) throw new Error("That memory was changed at the same time.")
    await tx.insert(memoryEvents).values({
      memoryId: row.id,
      userId: old.userId,
      action: input.actor === "user" ? "edit" : "supersede",
      before: old.content,
      after: content,
      actor: input.actor,
      chatId: input.chatId ?? null,
    })
    return row
  })
}

// Hard delete, with its whole history. Superseded versions go too.
export async function deleteMemory(userId: string, memoryId: string) {
  const chain = new Set([memoryId])
  let frontier = [memoryId]
  while (frontier.length) {
    const older = await db
      .select({ id: memories.id })
      .from(memories)
      .where(
        and(
          eq(memories.userId, userId),
          inArray(memories.supersededById, frontier)
        )
      )
    frontier = older.map((row) => row.id).filter((id) => !chain.has(id))
    for (const id of frontier) chain.add(id)
  }
  const deleted = await db
    .delete(memories)
    .where(and(eq(memories.userId, userId), inArray(memories.id, [...chain])))
    .returning({ id: memories.id, content: memories.content })
  return deleted.find((row) => row.id === memoryId)
}
