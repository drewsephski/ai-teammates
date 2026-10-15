import { and, desc, eq, isNull } from "drizzle-orm"

import { db } from "@/db"
import {
  aboutYouSchema,
  bots,
  memories,
  memorySettingsSchema,
  memoryUpdateSchema,
  userSettings,
  type AboutYou,
  type MemorySettings,
  type MemoryUpdate,
} from "@/db/schema"
import {
  deleteMemory as deleteMemoryRow,
  getUserSettings,
  getValidMemory,
  supersedeMemory,
  writeMemory,
} from "@/lib/memory"
import {
  aboutYouContent,
  aboutYouFields,
  readAboutYou,
} from "@/lib/memory-policy"

async function assertOwnBot(userId: string, botId: string | null) {
  if (botId === null) return
  const bot = await db.query.bots.findFirst({
    where: and(eq(bots.id, botId), eq(bots.userId, userId)),
    columns: { id: true },
  })
  if (!bot) throw new Error("Teammate not found")
}

// Everything the memory page shows: settings, About you, and the rest
export async function getMemoryOverview(userId: string) {
  const [settings, rows, teammates] = await Promise.all([
    getUserSettings(userId),
    db
      .select({
        id: memories.id,
        kind: memories.kind,
        content: memories.content,
        botId: memories.botId,
        pinned: memories.pinned,
        source: memories.source,
        sourceChatId: memories.sourceChatId,
        createdAt: memories.createdAt,
      })
      .from(memories)
      .where(
        and(
          eq(memories.userId, userId),
          eq(memories.status, "active"),
          isNull(memories.invalidAt)
        )
      )
      .orderBy(desc(memories.pinned), desc(memories.createdAt)),
    db
      .select({ id: bots.id, name: bots.name })
      .from(bots)
      .where(eq(bots.userId, userId))
      .orderBy(bots.createdAt),
  ])

  // The About you fields live in the same store; show them in their own form
  const about: AboutYou = {
    timezone: settings.timezone === "UTC" ? "" : settings.timezone,
    role: "",
    workingHours: "",
    answerStyle: "",
    about: "",
  }
  const listed = rows.filter((row) => {
    const field =
      row.source === "user_edit" && row.botId === null
        ? readAboutYou(row.content)
        : undefined
    if (!field) return true
    if (field.key !== "timezone") about[field.key] = field.value
    return false
  })

  return {
    memoryEnabled: settings.memoryEnabled,
    about,
    memories: listed,
    teammates,
  }
}

export async function updateMemory(
  userId: string,
  memoryId: string,
  input: MemoryUpdate
) {
  const values = memoryUpdateSchema.parse(input)
  await assertOwnBot(userId, values.botId)
  const old = await getValidMemory(userId, memoryId)
  if (!old) throw new Error("Memory not found")

  if (values.content !== old.content || values.kind !== old.kind) {
    // A real change keeps the old version as history and re-embeds the text
    return supersedeMemory({
      userId,
      memoryId,
      actor: "user",
      source: "user_edit",
      ...values,
    })
  }
  // Pin and scope are settings on the same fact, not a new version of it
  const [saved] = await db
    .update(memories)
    .set({ pinned: values.pinned, botId: values.botId })
    .where(and(eq(memories.id, memoryId), eq(memories.userId, userId)))
    .returning({ id: memories.id })
  return saved
}

export async function deleteMemory(userId: string, memoryId: string) {
  const deleted = await deleteMemoryRow(userId, memoryId)
  if (!deleted) throw new Error("Memory not found")
  return deleted
}

export async function updateMemorySettings(
  userId: string,
  input: MemorySettings
) {
  const values = memorySettingsSchema.parse(input)
  const [row] = await db
    .insert(userSettings)
    .values({ userId, ...values })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { ...values, updatedAt: new Date() },
    })
    .returning()
  return row
}

// Each field is a memory: a change supersedes it, and clearing it deletes it
export async function saveAboutYou(userId: string, input: AboutYou) {
  const values = aboutYouSchema.parse(input)

  const current = await db
    .select({ id: memories.id, content: memories.content })
    .from(memories)
    .where(
      and(
        eq(memories.userId, userId),
        eq(memories.source, "user_edit"),
        isNull(memories.botId),
        isNull(memories.invalidAt)
      )
    )
  const existing = new Map(
    current.flatMap((row) => {
      const field = readAboutYou(row.content)
      return field ? [[field.key, row] as const] : []
    })
  )

  for (const field of aboutYouFields) {
    const value = values[field.key].trim()
    const row = existing.get(field.key)
    const content = aboutYouContent(field.label, value)
    if (!value) {
      if (row) await deleteMemoryRow(userId, row.id)
    } else if (!row) {
      await writeMemory({
        userId,
        botId: null,
        kind: field.kind,
        content,
        importance: 9,
        confidence: 1,
        source: "user_edit",
        actor: "user",
      })
    } else if (row.content !== content) {
      await supersedeMemory({
        userId,
        memoryId: row.id,
        content,
        actor: "user",
        source: "user_edit",
      })
    }
  }

  await db
    .insert(userSettings)
    .values({ userId, timezone: values.timezone || "UTC" })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { timezone: values.timezone || "UTC", updatedAt: new Date() },
    })
  return values
}
