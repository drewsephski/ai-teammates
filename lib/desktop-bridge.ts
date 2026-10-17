import { WebSocket, createWebSocketStream } from "ws"

import {
  ComputerAllowanceSpentError,
  ComputerSessionEndedError,
} from "@/lib/sandbox-lifecycle"
import { DESKTOP_CLOSE } from "@/lib/sandbox-policy"

// The gateway's viewer-to-computer bridge. Plain `ws` and policy imports only,
// so tests can drive it with local sockets.

export type DesktopClose = { code: number; reason: string }

// Why a viewer's stream ended, as the close the viewer should get. Pure.
// - an allowance error, or no seconds left: 4429 usage_limit
// - the session was paused, rotated or replaced: 4410 session_ended
// - anything else (the computer is still running as before): undefined, which
//   closes normally
export function classifyDesktopTermination(input: {
  error?: unknown
  remainingSeconds?: number | null
  session?: "running" | "ended"
}): DesktopClose | undefined {
  if (input.error instanceof ComputerAllowanceSpentError)
    return DESKTOP_CLOSE.usageLimit
  if (
    input.remainingSeconds !== undefined &&
    input.remainingSeconds !== null &&
    input.remainingSeconds <= 0
  )
    return DESKTOP_CLOSE.usageLimit
  if (
    input.error instanceof ComputerSessionEndedError ||
    input.session === "ended"
  )
    return DESKTOP_CLOSE.sessionEnded
  return undefined
}

// Sends the viewer an explicit close frame with the code, then drops the
// socket if the peer doesn't finish the handshake. No code: a normal close.
export function closeViewer(
  viewer: WebSocket | undefined,
  close: DesktopClose | undefined,
  graceMs = 1_000
) {
  if (!viewer) return
  if (viewer.readyState === WebSocket.OPEN) {
    viewer.close(close?.code ?? 1000, close?.reason ?? "")
    setTimeout(() => viewer.terminate(), graceMs).unref()
  } else viewer.terminate()
}

// Pipes the viewer and the computer's stream both ways. Neither pipe ends the
// other side: a stream ending would close the viewer with 1005 before we know
// why. The provider closing is classified (`onUpstreamClosed`, which may
// meter and read usage), and then the viewer is closed with that code.
export function bridgeDesktop(
  viewer: WebSocket,
  upstream: WebSocket,
  options: {
    onUpstreamClosed: () => Promise<DesktopClose | undefined>
    graceMs?: number
  }
) {
  const incoming = createWebSocketStream(viewer)
  const outgoing = createWebSocketStream(upstream)
  incoming.pipe(outgoing, { end: false })
  outgoing.pipe(incoming, { end: false })

  let finished = false
  const finish = (close?: DesktopClose) => {
    if (finished) return
    finished = true
    upstream.terminate()
    closeViewer(viewer, close, options.graceMs)
  }
  incoming.on("error", () => finish())
  outgoing.on("error", () => finish())
  viewer.on("close", () => finish())
  upstream.on("close", async () => {
    // The viewer left first: nothing to explain
    if (finished || viewer.readyState !== WebSocket.OPEN) return finish()
    let close: DesktopClose | undefined
    try {
      close = await options.onUpstreamClosed()
    } catch {
      // Unknown reason: an ordinary close still beats a dropped connection
    }
    finish(close)
  })
  return { close: finish }
}
