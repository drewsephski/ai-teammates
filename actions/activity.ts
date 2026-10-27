"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import type { MorningSummarySettings } from "@/db/schema"
import * as service from "@/services/activity"

export async function updateMorningSummary(input: MorningSummarySettings) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  const row = await service.updateMorningSummary(userId, input)
  revalidatePath("/activity")
  return row
}
