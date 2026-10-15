"use server"

import { auth } from "@clerk/nextjs/server"
import { and, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"

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

export async function updateMemory(memoryId: string, input: MemoryUpdate) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  const values = memoryUpdateSchema.parse(input)
  await assertOwnBot(userId, values.botId)
  const old = await getValidMemory(userId, memoryId)
  if (!old) throw new Error("Memory not found")

  let saved
  if (values.content !== old.content || values.kind !== old.kind) {
    // A real change keeps the old version as history and re-embeds the text
    saved = await supersedeMemory({
      userId,
      memoryId,
      actor: "user",
      source: "user_edit",
      ...values,
    })
  } else {
    // Pin and scope are settings on the same fact, not a new version of it
    ;[saved] = await db
      .update(memories)
      .set({ pinned: values.pinned, botId: values.botId })
      .where(and(eq(memories.id, memoryId), eq(memories.userId, userId)))
      .returning({ id: memories.id })
  }
  revalidatePath("/memory")
  return saved
}

export async function deleteMemory(memoryId: string) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  const deleted = await deleteMemoryRow(userId, memoryId)
  if (!deleted) throw new Error("Memory not found")
  revalidatePath("/memory")
  return deleted
}

export async function updateMemorySettings(input: MemorySettings) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  const values = memorySettingsSchema.parse(input)
  const [row] = await db
    .insert(userSettings)
    .values({ userId, ...values })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { ...values, updatedAt: new Date() },
    })
    .returning()
  revalidatePath("/memory")
  return row
}

// Each field is a memory: a change supersedes it, and clearing it deletes it
export async function saveAboutYou(input: AboutYou) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
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
  revalidatePath("/memory")
  return values
}
