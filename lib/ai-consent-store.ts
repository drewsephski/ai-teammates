import { createClerkClient } from "@clerk/backend"
import * as Sentry from "@sentry/node"

import {
  AI_CONSENT_METADATA_KEY,
  allowsAnthropic,
  consentVersionOf,
  createConsentCache,
} from "@/lib/ai-consent"

// Not @clerk/nextjs: the Trigger.dev chat agent reads this too
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })

const cache = createConsentCache(async (userId) =>
  consentVersionOf((await clerk.users.getUser(userId)).privateMetadata)
)

// Whether this account's app-funded calls may go to Anthropic (lib/ai-consent.ts).
// Fails closed: without the key, a recorded v3 permission or a Clerk answer,
// the gateway serves the call.
export async function anthropicAllowed(userId: string) {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return false
  try {
    return allowsAnthropic(await cache.get(userId))
  } catch (error) {
    Sentry.logger.warn("AI permission unreadable; using Neon AI Gateway", {
      "error.type": error instanceof Error ? error.name : "UnknownError",
    })
    return false
  }
}

// null clears it: Clerk's metadata merge removes a key set to null
export async function saveAIConsentVersion(
  userId: string,
  version: number | null
) {
  await clerk.users.updateUserMetadata(userId, {
    privateMetadata: { [AI_CONSENT_METADATA_KEY]: version },
  })
  cache.set(userId, version)
}
