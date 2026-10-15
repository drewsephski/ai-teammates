import type { IncomingHttpHeaders } from "node:http"

import { bearerToken } from "@/lib/api-response"

export type DesktopAuth =
  | { ok: true; kind: "ticket"; ticket: string }
  | {
      ok: true
      kind: "clerk"
      headers: Headers
      authorizedParties?: string[]
    }
  | { ok: false; status: number }

// How a desktop WebSocket upgrade proves who it is.
// The native app's WebView can't set headers, so it brings a desktop ticket
// (see desktop-ticket.ts) in `?ticket=`: single-use, one minute, one chat.
// The ticket is the whole credential, so cookies are never read for it and
// any Origin (a WebView page has none of ours) is accepted.
// Browsers always send Origin on WebSockets and carry cookies, so without a
// ticket they must be same-origin and are authenticated by their Clerk cookie.
// Other native clients send no Origin and present a Clerk session token in
// the Authorization header. A session token in the URL is never accepted: it
// would land in proxy logs and unlock every API, not one computer.
export function desktopAuth(
  incoming: IncomingHttpHeaders,
  url: URL,
  origin: string
): DesktopAuth {
  const ticket = url.searchParams.get("ticket")
  if (ticket !== null)
    return ticket.length > 0 && ticket.length <= 1024
      ? { ok: true, kind: "ticket", ticket }
      : { ok: false, status: 401 }
  const headers = new Headers()
  if (incoming.origin !== undefined) {
    if (incoming.origin !== origin) return { ok: false, status: 403 }
    for (const [name, value] of Object.entries(incoming)) {
      if (value)
        headers.set(name, Array.isArray(value) ? value.join(", ") : value)
    }
    return { ok: true, kind: "clerk", headers, authorizedParties: [origin] }
  }
  const header = incoming.authorization
  const token = bearerToken(typeof header === "string" ? header : null)
  if (!token) return { ok: false, status: 401 }
  headers.set("authorization", `Bearer ${token}`)
  if (incoming.host) headers.set("host", incoming.host)
  return { ok: true, kind: "clerk", headers }
}
