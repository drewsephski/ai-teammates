import { NextResponse } from "next/server"

import { apiRoute, readJson } from "@/lib/api"
import { feedbackInputSchema } from "@/lib/feedback"
import { submitFeedback } from "@/services/feedback"

// Beta feedback from the app: { message, page?, source?, appVersion? }.
// Filed as a GitHub issue labelled `feedback`.
export const POST = apiRoute(async ({ userId }, request) => {
  const input = feedbackInputSchema.parse(await readJson(request))
  const feedback = await submitFeedback(userId, input)
  return NextResponse.json({ feedback }, { status: 201 })
})
