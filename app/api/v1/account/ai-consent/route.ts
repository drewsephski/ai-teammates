import { apiRoute, readJson } from "@/lib/api"
import { recordAIConsent } from "@/services/ai-consent"

// The app reports `{ version }` after the person allows AI processing (the
// AI_CONSENT_VERSION they accepted) and `{ version: null }` after they withdraw
// it. Added for the first build with consent v3; builds 33 and earlier never
// call it, so their accounts stay on Neon's AI gateway (lib/ai-consent.ts).
export const PUT = apiRoute(async ({ userId }, request) => ({
  aiConsent: await recordAIConsent(userId, await readJson(request)),
}))
