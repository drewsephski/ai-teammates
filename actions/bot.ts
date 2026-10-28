"use server"

import { auth, currentUser } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import type { BotInsert } from "@/db/schema"
import * as service from "@/services/bots"

export async function createBot(input: {
  requestId: string
  // A workspace preset or a public page's template (lib/bot-templates.ts)
  presetId?: string
}): Promise<service.CreateBotResult> {
  const { isAuthenticated, userId, has } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  const result = await service.createBot(
    { userId, has },
    input,
    async () => (await currentUser())?.firstName
  )
  if (result.ok) revalidatePath("/", "layout")
  return result
}

export async function setBotPinned(botId: string, pinned: boolean) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  await service.setBotPinned(userId, botId, pinned)
  revalidatePath("/", "layout")
}

export async function reorderPinnedBots(botIds: string[]) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  await service.reorderPinnedBots(userId, botIds)
  revalidatePath("/", "layout")
}

export async function updateBot(botId: string, values: BotInsert) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  const bot = await service.updateBot(userId, botId, values)
  // The bot shows up in the sidebar and in every chat it fronts
  revalidatePath("/", "layout")
  return bot
}

export async function deleteBot(botId: string) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  await service.deleteBot(userId, botId)
  revalidatePath("/", "layout")
}
