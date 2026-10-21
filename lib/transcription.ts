import { z } from "zod"
import {
  TRANSCRIPTION_MODEL,
  transcriptionCost,
  transcriptionErrorMessages,
  type TranscriptionResult,
} from "@/lib/transcription-policy"
import { readTranscriptionAudio } from "@/lib/transcription-audio"

const transcriptionResponseSchema = z.object({
  text: z.string().max(32_000),
  usage: z.object({ cost: z.number().finite().nonnegative() }).optional(),
})

type TranscriptionSteps = {
  apiKey?: string
  fetch: typeof fetch
  remaining: () => Promise<number>
  hold: (amount: number) => Promise<void>
  record: (amount: number) => Promise<void>
  report: (error: Error) => void
}

export async function transcribeRecording(
  input: unknown,
  steps: TranscriptionSteps
): Promise<TranscriptionResult> {
  const fail = (
    code: keyof typeof transcriptionErrorMessages
  ): TranscriptionResult => ({
    ok: false,
    code,
    error: transcriptionErrorMessages[code],
  })
  if (!steps.apiKey) return fail("unavailable")
  const audio = await readTranscriptionAudio(input)
  if (!audio) return fail("invalid_audio")
  const estimate = transcriptionCost(audio.seconds)
  if ((await steps.remaining()) < estimate) return fail("usage_limit")
  await steps.hold(estimate)
  // If the request times out after reaching the provider, retain the hold:
  // the existing abandoned-hold settlement accounts for an uncertain spend.
  let response: Response
  try {
    response = await steps.fetch(
      "https://openrouter.ai/api/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${steps.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: TRANSCRIPTION_MODEL,
          input_audio: {
            data: audio.bytes.toString("base64"),
            format: audio.format,
          },
        }),
        signal: AbortSignal.timeout(60_000),
      }
    )
  } catch {
    steps.report(new Error("Transcription provider request failed"))
    return fail("upstream")
  }
  if (!response.ok) {
    // Never log upstream bodies: they can contain audio or credentials.
    steps.report(
      new Error(`Transcription provider returned HTTP ${response.status}`)
    )
    await steps.record(0)
    return fail("upstream")
  }
  try {
    const result = transcriptionResponseSchema.parse(await response.json())
    await steps.record(
      result.usage ? Math.ceil(result.usage.cost * 1_000_000) : estimate
    )
    return { ok: true, text: result.text.trim() }
  } catch {
    steps.report(new Error("Transcription response or metering failed"))
    return fail("upstream")
  }
}
