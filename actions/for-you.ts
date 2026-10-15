"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import * as service from "@/services/for-you"

export async function getForYouSuggestion(): Promise<service.ForYouSuggestion> {
  const { isAuthenticated, userId, has } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return service.getForYouSuggestion({ userId, has })
}

export async function startForYouTask(token: string) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  const result = await service.startForYouTask(userId, token)
  revalidatePath("/", "layout")
  return result
}
