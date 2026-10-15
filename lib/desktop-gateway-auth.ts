import type { IncomingHttpHeaders } from "node:http"

import { bearerToken } from "@/lib/api-response"

export type DesktopAuth =
  | { ok: true; headers: Headers; authorizedParties?: string[] }
  | { ok: false; status: number }

// How a desktop WebSocket upgrade proves who it is.
// Browsers always send Origin on WebSockets and carry cookies, so they must be
// same-origin and are authenticated by their Clerk cookie, as before.
// Native apps send no Origin. They must present a Clerk session token, in the
// Authorization header or, for clients that can't set headers, `?token=`.
// Their cookies are dropped so only that token counts.
export function desktopAuth(
  incoming: IncomingHttpHeaders,
  url: URL,
  origin: string
): DesktopAuth {
  const headers = new Headers()
  if (incoming.origin !== undefined) {
    if (incoming.origin !== origin) return { ok: false, status: 403 }
    for (const [name, value] of Object.entries(incoming)) {
      if (value)
        headers.set(name, Array.isArray(value) ? value.join(", ") : value)
    }
    return { ok: true, headers, authorizedParties: [origin] }
  }
  const header = incoming.authorization
  const token =
    bearerToken(typeof header === "string" ? header : null) ??
    url.searchParams.get("token")
  if (!token) return { ok: false, status: 401 }
  headers.set("authorization", `Bearer ${token}`)
  if (incoming.host) headers.set("host", incoming.host)
  return { ok: true, headers }
}
