import { randomUUID } from "node:crypto"
import * as Sentry from "@sentry/nextjs"
import { withSandboxLock } from "@/lib/sandbox-lock"
import { transcribeRecording } from "@/lib/transcription"
import { getUsage, holdUsage, recordUsage } from "@/lib/usage"

export async function transcribeAudio(userId: string, audio: unknown) {
  const key = `ai:dictation:${userId}:${randomUUID()}`
  // Both surfaces serialize quota checks and holds for this account.
  return withSandboxLock(`dictation:${userId}`, async () =>
    transcribeRecording(audio, {
      apiKey: process.env.OPENROUTER_API_KEY,
      fetch,
      remaining: async () => (await getUsage(userId)).remaining.ai,
      hold: (amount) => holdUsage(userId, key, amount),
      record: (amount) =>
        recordUsage([{ userId, kind: "ai", amount, idempotencyKey: key }]),
      report: (error) => {
        Sentry.captureException(error, { tags: { surface: "dictation" } })
      },
    })
  )
}
