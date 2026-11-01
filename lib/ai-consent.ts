import { z } from "zod"

// The mobile app's AI permission screen is versioned (krafty-mobile
// src/lib/ai-consent.ts, AI_CONSENT_VERSION). Version 3 is the first that
// names Anthropic; versions 1 and 2 disclosed only Neon's AI gateway. So
// app-funded calls reach Anthropic only for an account that accepted v3 or
// later, recorded server-side. Everyone else goes straight to the gateway.
export const ANTHROPIC_CONSENT_VERSION = 3

// What the app reports after the person allows (the version they accepted)
// or withdraws (null) AI processing
export const aiConsentSchema = z.object({
  version: z.number().int().min(1).max(1000).nullable(),
})
export type AIConsent = z.infer<typeof aiConsentSchema>

// The key in the Clerk user's privateMetadata. Private metadata is readable
// and writable only with the secret key, so a client can't set it itself.
export const AI_CONSENT_METADATA_KEY = "aiConsentVersion"

export function consentVersionOf(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object") return null
  const version = (metadata as Record<string, unknown>)[AI_CONSENT_METADATA_KEY]
  return typeof version === "number" && Number.isInteger(version) && version > 0
    ? version
    : null
}

export function allowsAnthropic(version: number | null | undefined) {
  return typeof version === "number" && version >= ANTHROPIC_CONSENT_VERSION
}

// Remembers each account's version briefly, so turns in a row don't each ask
// Clerk. A failed read is never cached: the caller falls back to the gateway
// and the next call asks again.
export function createConsentCache(
  read: (userId: string) => Promise<number | null>,
  { ttlMs = 30_000, now = Date.now } = {}
) {
  const entries = new Map<string, { version: number | null; at: number }>()
  return {
    async get(userId: string) {
      const entry = entries.get(userId)
      if (entry && now() - entry.at < ttlMs) return entry.version
      const version = await read(userId)
      entries.set(userId, { version, at: now() })
      return version
    },
    set(userId: string, version: number | null) {
      entries.set(userId, { version, at: now() })
    },
  }
}
