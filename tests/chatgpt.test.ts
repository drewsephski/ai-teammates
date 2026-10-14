import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import test from "node:test"

import {
  chatGPTEncryptionKey,
  decryptChatGPTValue,
  encryptChatGPTValue,
  hashChatGPTValue,
} from "../lib/chatgpt-crypto"
import { chatGPTConfig } from "../lib/chatgpt-config"
import {
  appModelCost,
  canUseAI,
  CHATGPT_LIMIT_ERROR,
  CHATGPT_REQUEST_ERROR,
  hasChatGPTPlanGrant,
} from "../lib/chatgpt-policy"
import {
  chatGPTRequestBody,
  createChatGPTModel,
  sanitizedChatGPTStream,
} from "../lib/chatgpt-provider"
import { redactChatGPTEvent } from "../lib/chatgpt-telemetry"

test("ChatGPT-backed model usage bypasses exhausted credit and never calls app pricing", () => {
  assert.equal(canUseAI(0, true), true)
  assert.equal(canUseAI(0, false), false)
  assert.equal(canUseAI(1, false), true)
  assert.equal(
    appModelCost(true, () => {
      throw new Error("Must not price subscription models")
    }),
    0
  )
  assert.equal(
    appModelCost(false, () => 123),
    123
  )
})

test("identity sign-in alone does not authorize subscription inference", () => {
  for (const scopes of [
    [],
    ["openid", "email"],
    ["resource.invoke"],
    ["chatgpt.tokens.use.direct"],
  ])
    assert.equal(hasChatGPTPlanGrant(scopes), false)
  assert.equal(
    hasChatGPTPlanGrant(["resource.invoke", "chatgpt.tokens.use.direct"]),
    true
  )
})

test("encrypted credentials are bound to the user, token type and key", () => {
  const key = randomBytes(32)
  const encrypted = encryptChatGPTValue("test-credential", "user-a:access", key)
  assert.ok(!encrypted.includes("test-credential"))
  assert.equal(
    decryptChatGPTValue(encrypted, "user-a:access", key),
    "test-credential"
  )
  for (const context of ["user-b:access", "user-a:refresh"])
    assert.throws(() => decryptChatGPTValue(encrypted, context, key))
  assert.throws(() =>
    decryptChatGPTValue(encrypted, "user-a:access", randomBytes(32))
  )
  assert.throws(() =>
    decryptChatGPTValue(encrypted + "tampered", "user-a:access", key)
  )
  assert.throws(() => chatGPTEncryptionKey("short"))
  assert.equal(chatGPTEncryptionKey(key.toString("hex")).length, 32)
  assert.equal(hashChatGPTValue("state").length, 43)
})

test("hosted sign-in fails closed without a provisioned client and safe callback", () => {
  const original = { ...process.env }
  try {
    process.env.CHATGPT_CLIENT_ID = "dynamic_agent_client"
    process.env.CHATGPT_REDIRECT_URI =
      "https://example.com/api/chatgpt/callback"
    process.env.CHATGPT_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex")
    assert.equal(chatGPTConfig(), null)
    process.env.CHATGPT_CLIENT_ID = "oaiapp_fixture"
    assert.ok(chatGPTConfig())
    for (const url of [
      "http://public.example/api/chatgpt/callback",
      "https://example.com/wrong",
      "https://example.com/api/chatgpt/callback?redirect=evil",
      "https://user:password@example.com/api/chatgpt/callback",
    ]) {
      process.env.CHATGPT_REDIRECT_URI = url
      assert.equal(chatGPTConfig(), null)
    }
  } finally {
    process.env = original
  }
})

test("Responses transport enforces the subscription contract", () => {
  const body = JSON.parse(
    chatGPTRequestBody(
      JSON.stringify({
        input: [],
        store: true,
        stream: false,
        temperature: 1,
        metadata: { secret: "x" },
        previous_response_id: "resp_old",
        max_output_tokens: 10,
      })
    )
  )
  assert.deepEqual(body, { input: [], store: false, stream: true })
  assert.throws(() => chatGPTRequestBody('{"input":"not an array"}'))
})

function events(...data: unknown[]) {
  return data.map((value) => `data: ${JSON.stringify(value)}\n\n`).join("")
}
function streamResponse(value: string) {
  return new Response(value, {
    headers: { "content-type": "text/event-stream" },
  })
}
const completed = {
  type: "response.completed",
  response: { usage: { input_tokens: 1, output_tokens: 1 } },
}

test("OpenAI provider sends OAuth credentials, developer instructions and namespaced tools", async () => {
  let body: Record<string, unknown> = {}
  let requests = 0
  let tokens = 0
  const model = createChatGPTModel(
    "fixture-model",
    async () => `fixture-token-${++tokens}`,
    async (url, init) => {
      requests++
      assert.equal(String(url), "https://api.openai.com/v1/responses")
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        `Bearer fixture-token-${tokens}`
      )
      body = JSON.parse(String(init?.body))
      return streamResponse(events(completed))
    }
  )
  const options: Parameters<typeof model.doStream>[0] = {
    prompt: [
      { role: "system", content: "Be helpful." },
      { role: "user", content: [{ type: "text", text: "Hello" }] },
    ],
    tools: [
      {
        type: "function",
        name: "askUser",
        description: "Ask a question",
        inputSchema: {
          type: "object",
          properties: { question: { type: "string" } },
          required: ["question"],
          additionalProperties: false,
        },
      },
    ],
    maxOutputTokens: 50,
    temperature: 0.5,
  }
  for (let i = 0; i < 2; i++) {
    const result = await model.doStream(options)
    await result.stream.pipeTo(new WritableStream())
  }
  assert.equal(requests, 2)
  assert.equal(tokens, 2)
  assert.equal(body.store, false)
  assert.equal(body.stream, true)
  assert.equal(body.temperature, undefined)
  assert.equal(body.max_output_tokens, undefined)
  assert.equal((body.input as { role: string }[])[0].role, "developer")
  assert.equal(
    (body.tools as { type: string; name: string }[])[0].type,
    "namespace"
  )
  assert.equal((body.tools as { name: string }[])[0].name, "krafty")
  await assert.rejects(model.doGenerate(), /require streaming/)
})

test("HTTP failures stay safe and never trigger an application-funded fallback", async () => {
  let requests = 0
  const model = createChatGPTModel(
    "fixture-model",
    async () => "fixture-private-token",
    async () => {
      requests++
      return Response.json(
        {
          error: {
            code: "subscription_sharing_usage_limit_exceeded",
            message: "private upstream details",
          },
        },
        { status: 429 }
      )
    }
  )
  await assert.rejects(
    async () => model.doStream({ prompt: [] }),
    (error: Error) => {
      assert.equal(error.message, CHATGPT_LIMIT_ERROR)
      assert.ok(!JSON.stringify(error).includes("private"))
      return true
    }
  )
  assert.equal(requests, 1)
})

test("late subscription errors, incomplete replies and disconnected streams are failures", async () => {
  for (const raw of [
    events({
      type: "response.failed",
      sequence_number: 1,
      response: {
        error: {
          code: "subscription_sharing_usage_limit_exceeded",
          message: "private diagnostics",
        },
      },
    }),
    events({
      type: "response.incomplete",
      sequence_number: 1,
      response: { incomplete_details: { reason: "max_output_tokens" } },
    }),
    events({
      type: "response.created",
      response: { id: "resp_fixture", created_at: 1, model: "fixture-model" },
    }),
  ]) {
    const output = await new Response(
      sanitizedChatGPTStream(streamResponse(raw).body!)
    ).text()
    assert.ok(!output.includes("private diagnostics"))
    assert.ok(
      output.includes('"type":"response.failed"') ||
        output.includes('"type":"error"')
    )
    assert.ok(output.includes("has not been charged"))
  }
})

test("completed SSE survives chunk boundaries without inventing an error", async () => {
  const raw = events(
    { type: "response.output_text.delta", delta: "Hello 🌍" },
    completed
  )
  const bytes = new TextEncoder().encode(raw)
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 3)
        controller.enqueue(bytes.slice(i, i + 3))
      controller.close()
    },
  })
  assert.equal(await new Response(sanitizedChatGPTStream(source)).text(), raw)
})

test("OAuth telemetry removes codes, cookies, credentials and captured locals", () => {
  const event = {
    request: {
      url: "https://kraftybot.app/api/chatgpt/callback?code=private-code",
      data: "private-body",
      cookies: { session: "private-cookie" },
      headers: { authorization: "private-token" },
    },
    exception: {
      values: [
        {
          stacktrace: {
            frames: [
              {
                filename: "chatgpt-oauth.ts",
                vars: { token: "private-token" },
              },
            ],
          },
        },
      ],
    },
    breadcrumbs: [
      {
        data: {
          url: "https://auth.openai.com/api/accounts/authorize?state=private-state",
          body: "private-body",
        },
      },
    ],
  }
  const result = JSON.stringify(redactChatGPTEvent(event))
  assert.ok(!result.includes("private-"))
  assert.ok(result.includes("/api/chatgpt/callback"))
})
