"use server"

import { auth } from "@clerk/nextjs/server"

import type { AIConsent } from "@/lib/ai-consent"
import * as service from "@/services/ai-consent"

// The web has no AI permission screen yet, so nothing calls this today. A web
// account reaches Anthropic only after it accepts v3 here or in the app.
export async function recordAIConsent(input: AIConsent) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return service.recordAIConsent(userId, input)
}
