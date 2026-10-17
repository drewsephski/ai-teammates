import * as Sentry from "@sentry/nextjs"
import { NextResponse, type NextRequest } from "next/server"
import { timingSafeEqual } from "node:crypto"

import { readCapped } from "@/lib/api"
import { HttpError } from "@/lib/api-response"
import { receiveEmail } from "@/services/triggers"

// Where the inbound mail provider (Postmark, SendGrid Inbound Parse or
// Mailgun) posts mail sent to <token>@INBOUND_EMAIL_DOMAIN. The provider
// proves itself with INBOUND_EMAIL_SECRET, as the password of the URL's basic
// auth (https://inbound:<secret>@kraftybot.app/api/inbound/email) or as
// ?secret=. Mail for unknown addresses is accepted and dropped, so the
// provider doesn't retry it.

const MAX_EMAIL_BYTES = 2 * 1024 * 1024

function authorized(request: NextRequest) {
  const secret = process.env.INBOUND_EMAIL_SECRET?.trim()
  if (!secret) return false
  const basic = /^Basic\s+(\S+)$/i.exec(
    request.headers.get("authorization") ?? ""
  )?.[1]
  const password = basic
    ? Buffer.from(basic, "base64")
        .toString("utf8")
        .split(":")
        .slice(1)
        .join(":")
    : undefined
  const given = password ?? request.nextUrl.searchParams.get("secret") ?? ""
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  if (!authorized(request))
    return NextResponse.json({ ok: false }, { status: 401 })
  try {
    const type = request.headers.get("content-type") ?? ""
    let results
    if (/^application\/json\b/i.test(type)) {
      const text = await readCapped(request, MAX_EMAIL_BYTES)
      results = await receiveEmail({ json: JSON.parse(text) })
    } else {
      if (Number(request.headers.get("content-length") ?? 0) > MAX_EMAIL_BYTES)
        return NextResponse.json({ ok: false }, { status: 413 })
      const form = await request.formData()
      // Text fields only; attachments are left out
      const fields = new Map<string, string>()
      for (const [name, value] of form)
        if (typeof value === "string") fields.set(name, value)
      results = await receiveEmail({ form: fields })
    }
    // A failed wake is worth the provider's retry; the rest are final
    return NextResponse.json(
      { ok: true, results },
      { status: results.includes("failed") ? 503 : 200 }
    )
  } catch (error) {
    if (error instanceof HttpError)
      return NextResponse.json({ ok: false }, { status: error.status })
    if (error instanceof SyntaxError)
      return NextResponse.json({ ok: false }, { status: 400 })
    Sentry.captureException(error, { tags: { surface: "inbound-email" } })
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
