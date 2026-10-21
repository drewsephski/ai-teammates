import { parseBuffer, TrackType } from "music-metadata"
import {
  MAX_AUDIO_BYTES,
  MAX_RECORDING_SECONDS,
} from "@/lib/transcription-policy"

// Inspect the actual container, not a client-provided duration or extension.
export async function readTranscriptionAudio(input: unknown) {
  if (
    !(input instanceof Blob) ||
    input.size === 0 ||
    input.size > MAX_AUDIO_BYTES
  )
    return null
  const bytes = Buffer.from(await input.arrayBuffer())
  const wav =
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WAVE"
  const m4a = bytes.toString("ascii", 4, 8) === "ftyp"
  if (!wav && !m4a) return null
  try {
    const { format } = await parseBuffer(
      bytes,
      { mimeType: wav ? "audio/wav" : "audio/mp4" },
      { duration: true, skipCovers: true }
    )
    if (
      !format.duration ||
      !Number.isFinite(format.duration) ||
      format.duration > MAX_RECORDING_SECONDS ||
      (format.numberOfChannels !== 1 && format.numberOfChannels !== 2) ||
      format.trackInfo?.some((track) => track.type === TrackType.video)
    )
      return null
    return { bytes, format: wav ? "wav" : "m4a", seconds: format.duration }
  } catch {
    return null
  }
}
