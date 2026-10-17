import * as Sentry from "@sentry/nextjs"
import { after, NextResponse, type NextRequest } from "next/server"

import { readCapped } from "@/lib/api"
import { slackConfig } from "@/lib/slack"
import { verifySlackSignature } from "@/lib/slack-policy"
import { handleSlackEvent } from "@/services/slack"

// Slack's Events API. Every request is signed with the app's signing secret;
// Slack wants an answer within three seconds, so the work runs after the
// response. A retried delivery posts the same message ID, which the chat
// appends once.
export async function POST(request: NextRequest) {
  const config = slackConfig()
  if (!config) return NextResponse.json({ ok: false }, { status: 503 })
  const body = await readCapped(request, 1024 * 1024).catch(() => undefined)
  if (
    body === undefined ||
    !verifySlackSignature(config.signingSecret, {
      timestamp: request.headers.get("x-slack-request-timestamp"),
      signature: request.headers.get("x-slack-signature"),
      body,
    })
  )
    return NextResponse.json({ ok: false }, { status: 401 })

  let payload: { type?: unknown; challenge?: unknown }
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
  if (payload.type === "url_verification")
    return NextResponse.json({ challenge: payload.challenge })

  after(async () => {
    try {
      await handleSlackEvent(payload)
    } catch (error) {
      Sentry.captureException(error, { tags: { surface: "slack-events" } })
    }
  })
  return NextResponse.json({ ok: true })
}
