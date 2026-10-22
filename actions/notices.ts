"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import * as service from "@/services/notices"

export async function dismissNotice(noticeId: string) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  const dismissed = await service.dismissNotice(userId, noticeId)
  revalidatePath("/workspace")
  return dismissed
}
