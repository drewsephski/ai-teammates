import assert from "node:assert/strict"
import { once } from "node:events"
import type { AddressInfo } from "node:net"
import { after, test } from "node:test"
import { WebSocket, WebSocketServer } from "ws"

import {
  bridgeDesktop,
  classifyDesktopTermination,
  closeViewer,
  type DesktopClose,
} from "../lib/desktop-bridge"
import {
  ComputerAllowanceSpentError,
  ComputerSessionEndedError,
} from "../lib/sandbox-lifecycle"
import { DESKTOP_CLOSE } from "../lib/sandbox-policy"

const servers: WebSocketServer[] = []
after(() => {
  for (const server of servers) server.close()
})

async function listen() {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" })
  servers.push(server)
  await once(server, "listening")
  return {
    server,
    url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
  }
}

// A real viewer socket, a real "provider" socket and the bridge between them.
// The test holds the viewer's client end and the provider's server end.
async function setup(
  onUpstreamClosed: () => Promise<DesktopClose | undefined>
) {
  const provider = await listen()
  const gateway = await listen()
  const providerSide = once(provider.server, "connection")
  const gatewaySide = once(gateway.server, "connection")
  const viewer = new WebSocket(gateway.url)
  const viewerOpen = once(viewer, "open")
  const [serverViewer] = (await gatewaySide) as [WebSocket]
  const upstream = new WebSocket(provider.url)
  await once(upstream, "open")
  const [providerSocket] = (await providerSide) as [WebSocket]
  await viewerOpen
  const bridge = bridgeDesktop(serverViewer, upstream, {
    onUpstreamClosed,
    graceMs: 200,
  })
  const closed = once(viewer, "close") as Promise<[number, Buffer]>
  return { viewer, providerSocket, serverViewer, upstream, bridge, closed }
}

test("bytes cross the bridge both ways", async () => {
  const rig = await setup(async () => undefined)
  const toProvider = once(rig.providerSocket, "message")
  rig.viewer.send(Buffer.from("click"))
  assert.equal(((await toProvider) as [Buffer])[0].toString(), "click")
  const toViewer = once(rig.viewer, "message")
  rig.providerSocket.send(Buffer.from("frame"))
  assert.equal(((await toViewer) as [Buffer])[0].toString(), "frame")
  rig.bridge.close()
  await rig.closed
})

for (const [name, close, expected] of [
  ["allowance spent", DESKTOP_CLOSE.usageLimit, [4429, "usage_limit"]],
  ["session ended", DESKTOP_CLOSE.sessionEnded, [4410, "session_ended"]],
  ["anything else", undefined, [1000, ""]],
] as const) {
  test(`when the provider closes (${name}) the viewer gets the promised close, not 1005`, async () => {
    const rig = await setup(async () => {
      // Metering and the usage read take real time; the viewer must wait
      await new Promise((resolve) => setTimeout(resolve, 30))
      return close
    })
    rig.providerSocket.close(1001, "going away")
    const [code, reason] = await rig.closed
    assert.deepEqual([code, reason.toString()], expected)
  })
}

test("a classification that fails still closes the viewer normally", async () => {
  const rig = await setup(async () => {
    throw new Error("usage lookup failed")
  })
  rig.providerSocket.terminate()
  const [code] = await rig.closed
  assert.equal(code, 1000)
})

test("a viewer that leaves first closes the provider and is never classified", async () => {
  let classified = 0
  const rig = await setup(async () => {
    classified++
    return DESKTOP_CLOSE.usageLimit
  })
  const providerClosed = once(rig.providerSocket, "close")
  rig.viewer.close(1000)
  await providerClosed
  assert.equal(classified, 0)
})

test("the gateway can close the viewer itself with a code", async () => {
  const rig = await setup(async () => undefined)
  rig.bridge.close(DESKTOP_CLOSE.usageLimit)
  const [code, reason] = await rig.closed
  assert.deepEqual([code, reason.toString()], [4429, "usage_limit"])
})

test("closeViewer tolerates a missing viewer", () => {
  assert.doesNotThrow(() => closeViewer(undefined, DESKTOP_CLOSE.usageLimit))
})

test("terminations are classified: allowance, session, or an ordinary close", () => {
  const spent = new ComputerAllowanceSpentError("free")
  const ended = new ComputerSessionEndedError()
  assert.deepEqual(
    classifyDesktopTermination({ error: spent }),
    DESKTOP_CLOSE.usageLimit
  )
  assert.deepEqual(
    classifyDesktopTermination({ remainingSeconds: 0, session: "running" }),
    DESKTOP_CLOSE.usageLimit
  )
  // Spent wins over a session that also ended: the person needs to know why
  assert.deepEqual(
    classifyDesktopTermination({ remainingSeconds: -3, session: "ended" }),
    DESKTOP_CLOSE.usageLimit
  )
  assert.deepEqual(
    classifyDesktopTermination({ error: ended }),
    DESKTOP_CLOSE.sessionEnded
  )
  assert.deepEqual(
    classifyDesktopTermination({ remainingSeconds: 40, session: "ended" }),
    DESKTOP_CLOSE.sessionEnded
  )
  assert.equal(
    classifyDesktopTermination({ remainingSeconds: 40, session: "running" }),
    undefined
  )
  assert.equal(
    classifyDesktopTermination({ remainingSeconds: null }),
    undefined
  )
  assert.equal(
    classifyDesktopTermination({ error: new Error("boom") }),
    undefined
  )
})
