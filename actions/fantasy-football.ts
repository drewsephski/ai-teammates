"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import {
  getFantasySettings,
  saveFantasySettings,
} from "@/services/fantasy-football"

export async function loadFantasyFootballSettings(botId: string) {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")
  return getFantasySettings(userId, botId)
}

export async function updateFantasyFootballSettings(
  botId: string,
  input: unknown
) {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")
  const settings = await saveFantasySettings(userId, botId, input)
  revalidatePath("/", "layout")
  return settings
}
