import { auth } from "@clerk/nextjs/server"
import * as Sentry from "@sentry/nextjs"
import { NextResponse, type NextRequest } from "next/server"

import { apiErrorResponse, bearerToken, HttpError } from "@/lib/api-response"
import type { Caller } from "@/services/caller"

type Handler<TContext> = (
  caller: Caller,
  request: NextRequest,
  context: TContext
) => Promise<unknown>

// Route handlers for the native app. Only a Clerk session token in the
// Authorization header is accepted; the web app keeps using server actions.
export function apiRoute<TContext>(handler: Handler<TContext>) {
  return async (request: NextRequest, context: TContext) => {
    let response: NextResponse
    try {
      if (!bearerToken(request.headers.get("authorization")))
        throw new Error("Unauthorized")
      // clerkMiddleware verified the header token; a bad one is signed out
      const { isAuthenticated, userId, has } = await auth()
      if (!isAuthenticated) throw new Error("Unauthorized")
      const body = await handler({ userId, has }, request, context)
      response =
        body instanceof NextResponse
          ? body
          : NextResponse.json(body ?? { ok: true })
    } catch (error) {
      const { status, body, expected } = apiErrorResponse(error)
      if (!expected)
        Sentry.captureException(error, { tags: { surface: "api-v1" } })
      response = NextResponse.json(body, { status })
    }
    // Per-user data: never let a shared cache keep it
    response.headers.set("Cache-Control", "private, no-store")
    return response
  }
}

// Every v1 body is a small JSON document; the largest is a bot's instructions
const MAX_BODY_BYTES = 64 * 1024

const tooLarge = () =>
  new HttpError(413, "payload_too_large", "Request body is too large")

// Reads at most MAX_BODY_BYTES, even when the client sends no Content-Length
async function readCapped(request: NextRequest) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES)
    throw tooLarge()
  if (!request.body) return ""
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY_BYTES) {
      await reader.cancel()
      throw tooLarge()
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString("utf8")
}

// Parses a JSON body, treating an empty one as {}
export async function readJson(request: NextRequest): Promise<unknown> {
  const text = await readCapped(request)
  if (!text) return {}
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? ""))
    throw new HttpError(
      415,
      "unsupported_media_type",
      "Send the body as application/json"
    )
  return JSON.parse(text)
}
