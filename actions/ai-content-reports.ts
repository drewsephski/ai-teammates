"use server"

import { auth } from "@clerk/nextjs/server"
import type { AIContentReportInput } from "@/db/schema"
import * as service from "@/services/ai-content-reports"

export async function reportAIContent(
  chatId: string,
  messageId: string,
  input: AIContentReportInput
) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  await service.reportAIContent(userId, chatId, messageId, input)
  return { reported: true }
}
