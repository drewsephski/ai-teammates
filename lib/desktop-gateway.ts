import type { IncomingMessage } from "node:http"
import type { Duplex } from "node:stream"
import { createClerkClient } from "@clerk/backend"
import { and, eq } from "drizzle-orm"
import { WebSocket, WebSocketServer } from "ws"

import { ensureAccountComputer, touchComputer } from "@/lib/account-computer"
import { desktopAuth } from "@/lib/desktop-gateway-auth"
import { TicketReplayGuard, verifyDesktopTicket } from "@/lib/desktop-ticket"
import { db } from "@/db"
import { chats } from "@/db/schema"
import {
  bridgeDesktop,
  classifyDesktopTermination,
  closeViewer,
  type DesktopClose,
} from "@/lib/desktop-bridge"
import {
  getComputerInfo,
  getDesktopConnection,
  meterSandbox,
  renewComputerDesktop,
} from "@/lib/e2b"
import { ComputerAllowanceSpentError } from "@/lib/sandbox-lifecycle"
import { desktopHeartbeatMs } from "@/lib/sandbox-policy"
import { getUsage } from "@/lib/usage"

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
})
const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 })
const usedTickets = new TicketReplayGuard()

// Who is connecting. A ticket was minted by POST /api/v1/chats/:id/desktop,
// which already checked this user's computer time a minute ago. Every plan may
// view its computer while it has seconds left; that is checked below.
async function desktopUser(
  credentials: Exclude<ReturnType<typeof desktopAuth>, { ok: false }>,
  url: URL,
  chatId: string
) {
  if (credentials.kind === "ticket") {
    const holder = verifyDesktopTicket(
      credentials.ticket,
      chatId,
      process.env.CLERK_SECRET_KEY ?? "",
      usedTickets
    )
    return holder ? { userId: holder.userId } : null
  }
  const session = await clerk.authenticateRequest(
    new Request(url, { headers: credentials.headers }),
    { authorizedParties: credentials.authorizedParties }
  )
  const auth = session.toAuth()
  if (!auth?.userId) return null
  return { userId: auth.userId }
}

export async function upgradeDesktop(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer
) {
  const reject = (status: number) => {
    socket.write(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`)
    socket.destroy()
  }
  try {
    const protocol =
      request.headers["x-forwarded-proto"] === "https" ? "https" : "http"
    const origin = `${protocol}://${request.headers.host}`
    const url = new URL(request.url!, origin)
    // Browser WebSockets carry cookies, so cross-origin attempts are rejected
    // before auth; native apps without an Origin must bring a bearer token.
    const credentials = desktopAuth(request.headers, url, origin)
    if (!credentials.ok) return reject(credentials.status)
    const match = /^\/api\/chats\/([^/]+)\/desktop$/.exec(url.pathname)
    if (!match) return reject(404)
    const chatId = decodeURIComponent(match[1])
    const auth = await desktopUser(credentials, url, chatId)
    if (!auth) return reject(401)
    // Any chat of the person's streams the account's one computer
    const [chat] = await db
      .select({ id: chats.id })
      .from(chats)
      .where(and(eq(chats.id, chatId), eq(chats.userId, auth.userId)))
    if (!chat) return reject(404)
    const usage = await getUsage(auth.userId)
    // Free and paid alike: the viewer needs computer time left
    if (!usage || usage.remaining.sandbox <= 0) return reject(403)
    const sandboxId = await ensureAccountComputer(auth.userId)
    // Looking at the computer is use: it restarts the free plan's 30-day clock
    await touchComputer(auth.userId).catch(() => {})
    const connection = await getDesktopConnection(sandboxId)
    if (socket.destroyed) return
    // Neither the provider API key nor the private ingress token crosses to UI.
    const upstream = new WebSocket(connection.url, {
      headers: { "e2b-traffic-access-token": connection.token },
      handshakeTimeout: 15_000,
      maxPayload: 16 * 1024 * 1024,
    })
    let client: WebSocket | undefined
    let bridge: ReturnType<typeof bridgeDesktop> | undefined
    // Before the viewer is attached there is nothing to explain; afterwards
    // the bridge closes the viewer with the code (4429 usage_limit, 4410
    // session_ended) so the app can say why and offer to reconnect.
    const cleanup = (close?: DesktopClose) => {
      if (bridge) return bridge.close(close)
      upstream.terminate()
      closeViewer(client, close)
    }
    socket.on("close", () => cleanup())
    upstream.on("error", () => {
      if (!client) reject(502)
      cleanup()
    })
    upstream.once("open", () => {
      if (socket.destroyed) return cleanup()
      sockets.handleUpgrade(request, socket, head, (viewer) => {
        client = viewer
        bridge = bridgeDesktop(viewer, upstream, {
          // The provider ended the stream: its timeout paused the computer,
          // most likely because the allowance ran out. Meter, then say which.
          onUpstreamClosed: async () => {
            await meterSandbox(sandboxId)
            const left = await getUsage(auth.userId)
            const info = await getComputerInfo(sandboxId).catch(() => null)
            return classifyDesktopTermination({
              remainingSeconds: left?.remaining.sandbox,
              session:
                info &&
                info.state === "running" &&
                info.startedAt.getTime() === connection.startedAt.getTime()
                  ? "running"
                  : "ended",
            })
          },
        })
        let timer: ReturnType<typeof setTimeout> | undefined
        let closed = false
        let last: number | null = usage.remaining.sandbox
        const schedule = (remainingSeconds: number | null) => {
          if (closed) return
          // Often enough to stay inside a short idle timeout, which is what
          // keeps a small allowance from draining
          timer = setTimeout(beat, desktopHeartbeatMs(remainingSeconds))
        }
        async function beat() {
          try {
            // Meters, rechecks the allowance and renews only a still-running
            // session; a manual/session-limit pause or a spent allowance
            // disconnects the viewer and requires an explicit Resume.
            // null: a running tool held the computer, so nothing was read
            last =
              (await renewComputerDesktop(sandboxId, connection.startedAt)) ??
              last
            schedule(last)
          } catch (error) {
            cleanup(classifyDesktopTermination({ error }))
          }
        }
        schedule(usage.remaining.sandbox)
        viewer.once("close", () => {
          closed = true
          clearTimeout(timer)
        })
      })
    })
  } catch (error) {
    // A viewer asking after the time ran out is refused like any other
    reject(error instanceof ComputerAllowanceSpentError ? 403 : 503)
  }
}
