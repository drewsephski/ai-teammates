"use server"

import { auth } from "@clerk/nextjs/server"

import type { FeedbackInput } from "@/lib/feedback"
import * as service from "@/services/feedback"

export type SendFeedbackResult = { ok: true } | { ok: false; message: string }

// Production hides an action's error text, so a failure the person must read
// (send by email instead, slow down) comes back as data
export async function sendFeedback(
  input: FeedbackInput
): Promise<SendFeedbackResult> {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  try {
    await service.submitFeedback(userId, input)
    return { ok: true }
  } catch (error) {
    if (error instanceof Error && /^(Couldn't|You've) /.test(error.message))
      return { ok: false, message: error.message }
    throw error
  }
}
