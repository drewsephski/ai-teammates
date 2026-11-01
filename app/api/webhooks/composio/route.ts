import * as Sentry from "@sentry/nextjs"
import { NextResponse } from "next/server"

import { getComposio } from "@/lib/composio"
import { routineEventFromWebhook } from "@/lib/routine-events"
import { dispatchRoutineEvent } from "@/lib/routines"

// Composio's trigger deliveries for event routines (lib/routine-events.ts).
// No session: the signature, checked with COMPOSIO_WEBHOOK_SECRET, is what
// proves the request came from Composio, and it fails closed without one.
// A 2xx tells Composio not to redeliver; anything else is retried, and the
// webhook ID makes a retry start no second run.
export async function POST(request: Request) {
  const secret = process.env.COMPOSIO_WEBHOOK_SECRET?.trim()
  if (!secret)
    return NextResponse.json({ error: "Not configured" }, { status: 503 })
  const webhookId = request.headers.get("webhook-id")
  let parsed: Awaited<
    ReturnType<ReturnType<typeof getComposio>["triggers"]["parse"]>
  >
  try {
    parsed = await getComposio().triggers.parse(request, {
      verifySecret: secret,
    })
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }
  const event = routineEventFromWebhook(webhookId, parsed.payload)
  if (!event) return NextResponse.json({ ignored: true })
  try {
    const outcome = await dispatchRoutineEvent(event)
    return NextResponse.json({ outcome })
  } catch (error) {
    Sentry.captureException(error, {
      extra: { webhookId, triggerSlug: event.triggerSlug },
    })
    return NextResponse.json({ error: "Try again" }, { status: 500 })
  }
}
