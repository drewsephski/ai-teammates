import type { IncomingMessage } from "node:http"
import type { Duplex } from "node:stream"
import { createClerkClient } from "@clerk/backend"
import { and, eq } from "drizzle-orm"
import { WebSocket, WebSocketServer, createWebSocketStream } from "ws"

import { ensureBotComputer } from "@/lib/bot-computer"
import { db } from "@/db"
import { bots, chatMembers, chats } from "@/db/schema"
import { getBotDesktopConnection, renewBotDesktop } from "@/lib/e2b"
import { getUsage } from "@/lib/usage"

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
})
const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 })

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
    // Browser WebSockets carry cookies. Reject cross-origin attempts before auth.
    if (request.headers.origin !== origin) return reject(403)
    const url = new URL(request.url!, origin)
    const match = /^\/api\/chats\/([^/]+)\/desktop$/.exec(url.pathname)
    if (!match) return reject(404)
    const headers = new Headers()
    for (const [name, value] of Object.entries(request.headers)) {
      if (value)
        headers.set(name, Array.isArray(value) ? value.join(", ") : value)
    }
    const session = await clerk.authenticateRequest(
      new Request(url, { headers }),
      { authorizedParties: [origin] }
    )
    const auth = session.toAuth()
    if (!auth?.userId) return reject(401)
    if (!auth.has({ feature: "sandboxes" })) return reject(403)
    const [bot] = await db
      .select({ id: bots.id, sandboxId: bots.sandboxId })
      .from(chats)
      .innerJoin(chatMembers, eq(chatMembers.chatId, chats.id))
      .innerJoin(bots, eq(bots.id, chatMembers.botId))
      .where(
        and(
          eq(chats.id, decodeURIComponent(match[1])),
          eq(chats.userId, auth.userId),
          eq(bots.userId, auth.userId),
          eq(chats.kind, "direct")
        )
      )
    if (!bot) return reject(404)
    const usage = await getUsage(auth.userId)
    if (!usage || usage.remaining.sandbox <= 0) return reject(403)
    const sandboxId = await ensureBotComputer(bot.id, auth.userId)
    const connection = await getBotDesktopConnection(sandboxId)
    if (socket.destroyed) return
    // Neither the provider API key nor the private ingress token crosses to UI.
    const upstream = new WebSocket(connection.url, {
      headers: { "e2b-traffic-access-token": connection.token },
      handshakeTimeout: 15_000,
      maxPayload: 16 * 1024 * 1024,
    })
    let client: WebSocket | undefined
    const cleanup = () => {
      upstream.terminate()
      client?.terminate()
    }
    socket.on("close", cleanup)
    upstream.on("error", () => {
      if (!client) reject(502)
      cleanup()
    })
    upstream.once("open", () => {
      if (socket.destroyed) return cleanup()
      sockets.handleUpgrade(request, socket, head, (viewer) => {
        client = viewer
        const incoming = createWebSocketStream(viewer)
        const outgoing = createWebSocketStream(upstream)
        incoming.pipe(outgoing).pipe(incoming)
        incoming.on("error", cleanup)
        outgoing.on("error", cleanup)
        viewer.on("close", cleanup)
        upstream.on("close", cleanup)
        let renewing = false
        const heartbeat = setInterval(async () => {
          if (renewing) return
          renewing = true
          try {
            // Renew only a still-running session; a manual/session-limit pause
            // disconnects the viewer and requires an explicit Resume.
            const remaining = await getUsage(auth.userId!)
            if (!remaining || remaining.remaining.sandbox <= 0) return cleanup()
            await renewBotDesktop(sandboxId, connection.startedAt)
          } catch {
            cleanup()
          } finally {
            renewing = false
          }
        }, 30_000)
        viewer.once("close", () => clearInterval(heartbeat))
      })
    })
  } catch {
    reject(503)
  }
}
