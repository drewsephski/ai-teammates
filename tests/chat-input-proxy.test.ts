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
    request(record, `Bearer ${token(["write:sessions:chat_9"])}`),
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
