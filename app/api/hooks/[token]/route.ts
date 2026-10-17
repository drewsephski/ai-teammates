import * as Sentry from "@sentry/nextjs"
import { NextResponse, type NextRequest } from "next/server"

import { readCapped } from "@/lib/api"
import { HttpError } from "@/lib/api-response"
import { receiveWebhook } from "@/services/triggers"

// A webhook trigger's URL. No session: the token in the path is the
// credential, and anyone holding it can wake the bot, so the event is handed
// to the bot as untrusted data and the trigger is rate limited. Senders get a
// status they can act on; nothing about the trigger or bot is revealed.

const MAX_WEBHOOK_BYTES = 256 * 1024

const statuses = {
  accepted: 202,
  duplicate: 200,
  not_found: 404,
  sender_refused: 403,
  rate_limited: 429,
  skipped: 202,
  failed: 503,
} as const

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  let body: string
  try {
    body = await readCapped(request, MAX_WEBHOOK_BYTES)
  } catch (error) {
    if (error instanceof HttpError)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status }
      )
    throw error
  }
  try {
    const result = await receiveWebhook(token, {
      headers: request.headers,
      body,
    })
    return NextResponse.json(
      { ok: statuses[result] < 400, result },
      {
        status: statuses[result],
        headers: {
          "Cache-Control": "no-store",
          ...(result === "rate_limited" && { "Retry-After": "3600" }),
        },
      }
    )
  } catch (error) {
    Sentry.captureException(error, { tags: { surface: "webhook-trigger" } })
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
