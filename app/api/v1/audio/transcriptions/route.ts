import { NextResponse } from "next/server"
import { apiRoute } from "@/lib/api"
import { readAudioUpload } from "@/lib/transcription-upload"
import { transcribeAudio } from "@/services/transcription"

export const POST = apiRoute(async (caller, request) => {
  const result = await transcribeAudio(
    caller.userId,
    await readAudioUpload(request)
  )
  if (!result.ok) {
    const status = {
      invalid_audio: 400,
      usage_limit: 429,
      unavailable: 503,
      upstream: 502,
    }[result.code]
    return NextResponse.json(
      { error: { code: result.code, message: result.error } },
      { status }
    )
  }
  return { text: result.text }
})
