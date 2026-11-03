import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import test from "node:test"

import { proxyChatInput } from "../lib/chat-input-proxy"
import { openMessage } from "../lib/chat-content-seal"

// The chat transport's `.in/append`, through our server: the record reaches
// Trigger.dev sealed, under the client's own session token.

const key = randomBytes(32)

function token(scopes: string[]) {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url")
  return `${part({ alg: "HS256" })}.${part({ pub: true, scopes })}.signature`
}

const record = JSON.stringify({
  kind: "message",
  payload: {
    chatId: "chat_1",
    trigger: "submit-message",
    message: {
      id: "m1",
      role: "user",
      parts: [{ type: "text", text: "Call Alice at 5" }],
    },
    metadata: { botId: "bot_1" },
  },
})

function request(body: string, authorization?: string) {
  return new Request(
    "https://kraftybot.app/api/trigger/realtime/v1/sessions/chat_1/in/append",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Part-Id": "part_1",
        ...(authorization && { Authorization: authorization }),
      },
      body,
    }
  )
}

function deps(response = Response.json({ ok: true, seq: 4 })) {
  const forwarded: { url: string; init: RequestInit }[] = []
  const keyLookups: string[] = []
  return {
    forwarded,
    keyLookups,
    deps: {
      baseURL: "https://api.trigger.dev",
      contentKey: async (chatId: string) => {
        keyLookups.push(chatId)
        return chatId === "chat_1" ? key : undefined
      },
      fetch: (async (url: string, init: RequestInit) => {
        forwarded.push({ url, init })
        return response
      }) as unknown as typeof fetch,
    },
  }
}

test("a send is sealed and forwarded with the client's token and part ID", async () => {
  const auth = `Bearer ${token(["read:sessions:chat_1", "write:sessions:chat_1"])}`
  const { deps: d, forwarded } = deps()
  const response = await proxyChatInput(request(record, auth), "chat_1", d)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true, seq: 4 })

  assert.equal(forwarded.length, 1)
  const { url, init } = forwarded[0]
  assert.equal(
    url,
    "https://api.trigger.dev/realtime/v1/sessions/chat_1/in/append"
  )
  const headers = init.headers as Record<string, string>
  assert.equal(headers.Authorization, auth)
  assert.equal(headers["X-Part-Id"], "part_1")
  const body = init.body as string
  assert.doesNotMatch(body, /Alice/)
  const sent = JSON.parse(body)
  assert.deepEqual(sent.payload.metadata, { botId: "bot_1" })
  assert.deepEqual(openMessage(sent.payload.message, "chat_1", key).parts, [
    { type: "text", text: "Call Alice at 5" },
  ])
})

test("Trigger.dev's refusals reach the transport unchanged", async () => {
  const auth = `Bearer ${token(["write:sessions:chat_1"])}`
  const closed = Response.json(
    { error: "closed", code: "session_closed" },
    { status: 409 }
  )
  const response = await proxyChatInput(
    request(record, auth),
    "chat_1",
    deps(closed).deps
  )
  assert.equal(response.status, 409)
  assert.equal((await response.json()).code, "session_closed")
})

test("a token for another session, or none, is turned away before the database", async () => {
  for (const authorization of [
    undefined,
    "Bearer not-a-jwt",
    `Bearer ${token(["write:sessions:chat_2"])}`,
    `Bearer ${token(["read:sessions:chat_1"])}`,
  ]) {
    const { deps: d, forwarded, keyLookups } = deps()
    const response = await proxyChatInput(
      request(record, authorization),
      "chat_1",
      d
    )
    assert.equal(response.status, 401)
    assert.equal(forwarded.length, 0)
    assert.equal(keyLookups.length, 0)
  }
})

test("a deleted chat gets 404 and nothing is forwarded", async () => {
  const { deps: d, forwarded } = deps()
  const response = await proxyChatInput(
    request(
      record.replaceAll("chat_1", "chat_9"),
      `Bearer ${token(["write:sessions:chat_9"])}`
    ),
    "chat_9",
    d
  )
  assert.equal(response.status, 404)
  assert.equal(forwarded.length, 0)
})

test("a body that isn't a record is refused rather than forwarded in the clear", async () => {
  const { deps: d, forwarded } = deps()
  const response = await proxyChatInput(
    request("plain text", `Bearer ${token(["write:sessions:chat_1"])}`),
    "chat_1",
    d
  )
  assert.equal(response.status, 400)
  assert.equal(forwarded.length, 0)
})

test("stop records pass through unchanged", async () => {
  const { deps: d, forwarded } = deps()
  const stop = JSON.stringify({ kind: "stop" })
  await proxyChatInput(
    request(stop, `Bearer ${token(["write:sessions:chat_1"])}`),
    "chat_1",
    d
  )
  assert.equal(forwarded[0].init.body, stop)
})

test("wire session mismatch or omission is rejected before key lookup and forwarding", async () => {
  for (const chatId of ["chat_2", "", null, undefined]) {
    const body = JSON.parse(record)
    body.payload.chatId = chatId
    const d = deps()
    const response = await proxyChatInput(
      request(
        JSON.stringify(body),
        `Bearer ${token(["write:sessions:chat_1"])}`
      ),
      "chat_1",
      d.deps
    )
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: "Invalid record" })
    assert.deepEqual(d.keyLookups, [])
    assert.deepEqual(d.forwarded, [])
  }
})

test("same-session regenerate without messages remains supported", async () => {
  const d = deps()
  const body = JSON.stringify({
    kind: "message",
    payload: { chatId: "chat_1", trigger: "regenerate-message" },
  })
  const response = await proxyChatInput(
    request(body, `Bearer ${token(["write:sessions:chat_1"])}`),
    "chat_1",
    d.deps
  )
  assert.equal(response.status, 200)
  assert.equal(d.forwarded[0].init.body, body)
})

const LIMIT = 1024 * 1024
const auth = `Bearer ${token(["write:sessions:chat_1"])}`
function streamed(
  chunks: Uint8Array[],
  options: { length?: string; cancelError?: boolean; error?: Error } = {}
) {
  let reads = 0
  let cancelled = 0
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (options.error) {
          controller.error(options.error)
          return
        }
        if (reads === chunks.length) {
          controller.close()
          return
        }
        controller.enqueue(chunks[reads++])
      },
      cancel() {
        cancelled++
        if (options.cancelError) throw new Error("Cancel failed")
      },
    },
    { highWaterMark: 0 }
  )
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    body: stream,
    duplex: "half",
    headers: {
      Authorization: auth,
      ...(options.length !== undefined && { "Content-Length": options.length }),
    },
  }
  const req = new Request("https://kraftybot.app/input", init)
  return { req, reads: () => reads, cancelled: () => cancelled }
}

for (const length of [undefined, "1", "invalid", "-1"]) {
  test(`stream overflow with declared length ${length} cancels before reading the tail`, async () => {
    const input = streamed(
      [new Uint8Array(LIMIT), new Uint8Array(1), new Uint8Array(100)],
      { length }
    )
    const d = deps()
    const response = await proxyChatInput(input.req, "chat_1", d.deps)
    assert.equal(response.status, 413)
    assert.deepEqual(await response.json(), { error: "Message too large" })
    assert.equal(input.reads(), 2)
    assert.equal(input.cancelled(), 1)
    assert.equal(input.req.body?.locked, false)
    assert.deepEqual(d.keyLookups, [])
    assert.deepEqual(d.forwarded, [])
  })
}

test("declared overflow is rejected without pulling any body chunks", async () => {
  const input = streamed([new Uint8Array(1)], { length: String(LIMIT + 1) })
  const d = deps()
  assert.equal((await proxyChatInput(input.req, "chat_1", d.deps)).status, 413)
  assert.equal(input.reads(), 0)
  assert.deepEqual(d.keyLookups, [])
  assert.deepEqual(d.forwarded, [])
})

test("a single oversized chunk is refused even when cancellation rejects", async () => {
  const input = streamed([new Uint8Array(LIMIT + 1), new Uint8Array(1)], {
    cancelError: true,
  })
  const d = deps()
  assert.equal((await proxyChatInput(input.req, "chat_1", d.deps)).status, 413)
  assert.equal(input.cancelled(), 1)
  assert.equal(input.reads(), 1)
  assert.equal(input.req.body?.locked, false)
  assert.deepEqual(d.keyLookups, [])
  assert.deepEqual(d.forwarded, [])
})

test("an exact-cap valid record is forwarded and cap plus one never reaches the key", async () => {
  for (const extra of [0, 1]) {
    const bytes = Buffer.from(
      record + " ".repeat(LIMIT - Buffer.byteLength(record) + extra)
    )
    const input = streamed([bytes.subarray(0, 500), bytes.subarray(500)])
    const d = deps()
    assert.equal(
      (await proxyChatInput(input.req, "chat_1", d.deps)).status,
      extra ? 413 : 200
    )
    assert.equal(d.forwarded.length, extra ? 0 : 1)
    assert.equal(d.keyLookups.length, extra ? 0 : 1)
    assert.equal(input.req.body?.locked, false)
  }
})

test("split UTF-8 is decoded once, retaining request.text BOM semantics", async () => {
  const value = JSON.parse(record)
  value.payload.message.parts[0].text = "é🙂"
  const bytes = Buffer.from("\uFEFF" + JSON.stringify(value))
  const input = streamed(Array.from(bytes, (byte) => Uint8Array.of(byte)))
  const d = deps()
  assert.equal((await proxyChatInput(input.req, "chat_1", d.deps)).status, 200)
  const sent = JSON.parse(d.forwarded[0].init.body as string)
  assert.deepEqual(openMessage(sent.payload.message, "chat_1", key).parts, [
    { type: "text", text: "é🙂" },
  ])
})

test("empty and failing/aborted streams never load keys or forward partial JSON", async () => {
  const empty = new Request("https://kraftybot.app/input", {
    method: "POST",
    headers: { Authorization: auth },
  })
  const d = deps()
  assert.equal((await proxyChatInput(empty, "chat_1", d.deps)).status, 400)
  for (const error of [
    new Error("Read failed"),
    new DOMException("Aborted", "AbortError"),
  ]) {
    const input = streamed([], { error })
    await assert.rejects(proxyChatInput(input.req, "chat_1", d.deps), error)
    assert.equal(input.req.body?.locked, false)
  }
  assert.deepEqual(d.keyLookups, [])
  assert.deepEqual(d.forwarded, [])
})
