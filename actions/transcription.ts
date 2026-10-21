"use server"

import { auth } from "@clerk/nextjs/server"
import { transcribeAudio } from "@/services/transcription"

export async function transcribeSpeech(form: FormData) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return transcribeAudio(userId, form.get("audio"))
}
