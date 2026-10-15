"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import * as service from "@/services/for-you"

const itemIdSchema = z.string().min(1).max(64)
const feedbackSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("dismiss"),
    reason: z.enum(["not_relevant", "done", "wrong_bot"]),
  }),
  z.object({ type: z.literal("snooze") }),
])

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
  action: z.infer<typeof feedbackSchema>
) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  await service.updateForYouItem(
    userId,
    itemIdSchema.parse(itemId),
    feedbackSchema.parse(action)
  )
}
