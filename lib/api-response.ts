import { ZodError } from "zod"

import {
  ACTIVE_PLAN_ERROR,
  FREE_APP_LIMIT_ERROR,
  FREE_BOT_LIMIT_ERROR,
} from "@/lib/billing-policy"

// The mobile API's error body. `code` is stable for clients to branch on;
// `message` is safe to show to the person.
export type ApiError = {
  error: { code: string; message: string; issues?: unknown }
}

// Thrown by the API layer itself when the request, not a service, is wrong
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

// Services throw plain Errors with user-facing messages. Map the known ones to
// HTTP statuses; anything else is a 500 whose message is never exposed.
export function apiErrorResponse(error: unknown): {
  status: number
  body: ApiError
  expected: boolean
} {
  const fail = (status: number, code: string, message: string) => ({
    status,
    body: { error: { code, message } },
    // Upstream failures were already sent to Sentry by the service
    expected: status < 500 || code === "upstream",
  })
  if (error instanceof HttpError)
    return fail(error.status, error.code, error.message)
  if (error instanceof ZodError)
    return {
      status: 400,
      body: {
        error: {
          code: "invalid_request",
          message: error.issues[0]?.message ?? "Invalid request",
          issues: error.issues,
        },
      },
      expected: true,
    }
  if (error instanceof SyntaxError)
    return fail(400, "invalid_request", "Request body must be JSON")
  if (!(error instanceof Error))
    return fail(500, "internal", "Something went wrong")
  const message = error.message
  if (message === "Unauthorized") return fail(401, "unauthorized", message)
  if (
    message === "Upgrade required" ||
    message === "Group chats require a paid plan."
  )
    return fail(403, "upgrade_required", message)
  if (message === FREE_BOT_LIMIT_ERROR || message === FREE_APP_LIMIT_ERROR)
    return fail(403, "plan_limit", message)
  if (message === "Usage limit reached")
    return fail(429, "usage_limit", message)
  if (/ not found$/i.test(message)) return fail(404, "not_found", message)
  if (
    message === "Conversations changed. Try again." ||
    message === "Pinned bots changed. Try again." ||
    message === ACTIVE_PLAN_ERROR ||
    message === "That memory was changed at the same time."
  )
    return fail(409, "conflict", message)
  if (
    message === "Unknown starting role" ||
    message === "Unknown usage" ||
    message === "Pick between two and eight different bots."
  )
    return fail(400, "invalid_request", message)
  // For you token checks explain what changed and ask for a refresh
  if (/Refresh For you\.$/.test(message)) return fail(409, "stale", message)
  if (message === "Invalid recommendation")
    return fail(400, "invalid_request", message)
  // Provider failures the service already reported, worded for the person
  if (/^Couldn't /.test(message)) return fail(502, "upstream", message)
  return fail(500, "internal", "Something went wrong")
}

// The session JWT a native client sends. Cookies are ignored on purpose, so a
// browser on another site can never ride the person's Clerk cookie here.
export function bearerToken(header: string | null) {
  const match = header?.match(/^Bearer\s+(\S+)$/i)
  return match ? match[1] : null
}

// The public origin of this request. Behind Railway's proxy the request's own
// URL is internal, so use the forwarded scheme and Host, as the gateway does
// when it checks a browser's Origin.
export function publicOrigin(headers: Headers) {
  const secure = headers.get("x-forwarded-proto") === "https"
  const host = headers.get("host")
  if (!host) throw new Error("Missing Host header")
  return `${secure ? "https" : "http"}://${host}`
}

// The public WebSocket URL for a gateway path
export function desktopSocketUrl(headers: Headers, path: string) {
  return new URL(path, publicOrigin(headers).replace(/^http/, "ws")).href
}
