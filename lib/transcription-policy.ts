export const TRANSCRIPTION_MODEL = "mistralai/voxtral-small-transcribe-3-0"
export const MAX_RECORDING_SECONDS = 120
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024
// OpenRouter's published USD/second rate, converted to the usage ledger's units.
export const TRANSCRIPTION_MICRODOLLARS_PER_SECOND = 67
export const TRANSCRIPTION_UNAVAILABLE = "Dictation isn't configured yet."
export const TRANSCRIPTION_FAILED =
  "Couldn't transcribe your recording. Try again."

export const transcriptionErrorMessages = {
  invalid_audio: "Record a WAV or M4A audio clip up to two minutes long.",
  usage_limit: "Usage limit reached",
  unavailable: TRANSCRIPTION_UNAVAILABLE,
  upstream: TRANSCRIPTION_FAILED,
} as const

export type TranscriptionResult =
  | { ok: true; text: string }
  | { ok: false; code: keyof typeof transcriptionErrorMessages; error: string }

export function transcriptionCost(seconds: number) {
  return Math.ceil(seconds * TRANSCRIPTION_MICRODOLLARS_PER_SECOND)
}

export function insertDictation(
  text: string,
  transcript: string,
  position: number
) {
  const words = transcript.trim()
  if (!words) return { text, position }
  const before = text.slice(0, position)
  const after = text.slice(position)
  const inserted = `${before && !/\s$/.test(before) ? " " : ""}${words}${after && !/^\s|^[.,!?;:]/.test(after) ? " " : ""}`
  return {
    text: before + inserted + after,
    position: before.length + inserted.length,
  }
}
