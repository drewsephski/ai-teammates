"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import {
  appSuggestionsSchema,
  forYouItemActionSchema,
  type ForYouItemAction,
} from "@/lib/for-you"
import * as service from "@/services/for-you"

const itemIdSchema = z.string().min(1).max(64)

export async function refreshForYou(
  force = false
): Promise<service.ForYouState> {
  const { isAuthenticated, userId, has } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return service.refreshForYou({ userId, has }, { force: force === true })
}

export async function startForYouItem(itemId: string) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  const result = await service.startForYouItem(
    userId,
    itemIdSchema.parse(itemId)
  )
  revalidatePath("/", "layout")
  return result
}

export async function updateForYouItem(
  itemId: string,
  action: ForYouItemAction
) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  await service.updateForYouItem(
    userId,
    itemIdSchema.parse(itemId),
    forYouItemActionSchema.parse(action)
  )
}

// Turns For you suggestions from one app on or off
export async function setAppSuggestions(toolkit: string, proactive: boolean) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  const input = appSuggestionsSchema.parse({ toolkit, proactive })
  const result = await service.setAppSuggestions(
    userId,
    input.toolkit,
    input.proactive
  )
  revalidatePath("/workspace")
  return result
}
