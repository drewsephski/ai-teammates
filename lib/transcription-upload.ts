import { HttpError } from "@/lib/api-response"
import { MAX_AUDIO_BYTES } from "@/lib/transcription-policy"

// Native clients send the recording directly, without base64 expansion.
export async function readAudioUpload(request: Request) {
  const type = request.headers.get("content-type")?.split(";")[0]
  if (type !== "audio/wav" && type !== "audio/mp4" && type !== "audio/x-m4a")
    throw new HttpError(
      415,
      "unsupported_media_type",
      "Send a WAV or M4A recording"
    )
  const tooLarge = () =>
    new HttpError(413, "payload_too_large", "Recording is too large")
  if (Number(request.headers.get("content-length") ?? 0) > MAX_AUDIO_BYTES)
    throw tooLarge()
  if (!request.body) return new Blob([], { type })
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_AUDIO_BYTES) {
        await reader.cancel()
        throw tooLarge()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return new Blob([Buffer.concat(chunks)], { type })
}
