import * as Sentry from "@sentry/node"

import { aiConsentSchema, type AIConsent } from "@/lib/ai-consent"
import { saveAIConsentVersion } from "@/lib/ai-consent-store"

export const AI_CONSENT_SAVE_ERROR =
  "Couldn't save your AI permission. Try again."

// Records the AI permission the person accepted on a device (its version), or
// their withdrawal (null). Only v3 or later lets app-funded calls reach
// Anthropic (lib/ai-consent.ts). The save is a parameter so tests run offline.
export async function recordAIConsent(
  userId: string,
  input: unknown,
  save: typeof saveAIConsentVersion = saveAIConsentVersion
): Promise<AIConsent> {
  const { version } = aiConsentSchema.parse(input)
  try {
    await save(userId, version)
  } catch (cause) {
    Sentry.captureException(cause)
    throw new Error(AI_CONSENT_SAVE_ERROR)
  }
  return { version }
}
