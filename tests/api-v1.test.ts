import assert from "node:assert/strict"
import test from "node:test"
import { z } from "zod"
import {
  EVENT_ROUTINE_CHANGE_ERROR,
  eventAccountChoiceError,
  eventConnectError,
} from "../lib/routine-events"
import { EMAIL_CHANGED_ERROR } from "../lib/email-draft"
import { NextRequest } from "next/server"

import { apiRoute, readJson } from "../lib/api"
import {
  apiErrorResponse,
  bearerToken,
  desktopSocketUrl,
  HttpError,
} from "../lib/api-response"
import { publicBot, publicChat, publicPreset } from "../lib/api-shapes"
import { botPresets } from "../lib/bot-presets"
import { desktopAuth } from "../lib/desktop-gateway-auth"
import {
  createDesktopTicket,
  DESKTOP_TICKET_TTL_MS,
  TicketReplayGuard,
  verifyDesktopTicket,
} from "../lib/desktop-ticket"
import { sidebarSections } from "../lib/sidebar-order"
import { ACTIVE_PLAN_ERROR, FREE_BOT_LIMIT_ERROR } from "../lib/billing-policy"
import type { Bot, Chat } from "../db/schema"

const bot = (id: string, pinnedAt: Date | null = null): Bot => ({
  id,
  userId: "user_1",
  name: id,
  avatar: id,
  job: "Writer",
  instructions: null,
  taskBudget: null,
  setupComplete: true,
  pinnedAt,
  sandboxId: "sbx_secret",
  createdAt: new Date("2026-01-01T00:00:00Z"),
})
const chat = (
  id: string,
  kind: Chat["kind"],
  bots: Bot[]
): Chat & { bots: Bot[] } => ({
  id,
  userId: "user_1",
  kind,
  name: kind === "group" ? id : null,
  lastMessagePreview: null,
  memoryMode: "on",
  lastMessageAt: new Date("2026-01-02T00:00:00Z"),
  createdAt: new Date("2026-01-01T00:00:00Z"),
  bots,
})

test("bearer tokens are read only from a well-formed Authorization header", () => {
  assert.equal(bearerToken("Bearer abc.def.ghi"), "abc.def.ghi")
  assert.equal(bearerToken("bearer abc"), "abc")
  for (const header of [
    null,
    "",
    "Bearer",
    "Bearer ",
    "Basic abc",
    "Bearer a b",
  ])
    assert.equal(bearerToken(header), null)
})

test("service errors map to stable codes and statuses without leaking internals", () => {
  const cases: [unknown, number, string][] = [
    [new Error(EMAIL_CHANGED_ERROR), 409, "conflict"],
    [new Error("Unauthorized"), 401, "unauthorized"],
    [new Error("Upgrade required"), 403, "upgrade_required"],
    [new Error(FREE_BOT_LIMIT_ERROR), 403, "plan_limit"],
    [new Error("Usage limit reached"), 429, "usage_limit"],
    [new Error("Chat not found"), 404, "not_found"],
    [new Error("Message not found"), 404, "not_found"],
    [new Error("Bot not found"), 404, "not_found"],
    [new Error("Rule not found"), 404, "not_found"],
    [new Error("Conversations changed. Try again."), 409, "conflict"],
    [new Error("Pinned bots changed. Try again."), 409, "conflict"],
    [new Error("This recommendation expired. Refresh For you."), 409, "stale"],
    [new SyntaxError("Unexpected token"), 400, "invalid_request"],
    [z.object({ a: z.string() }).safeParse({}).error, 400, "invalid_request"],
  ]
  for (const [error, status, code] of cases) {
    const response = apiErrorResponse(error)
    assert.equal(response.status, status)
    assert.equal(response.body.error.code, code)
    assert.equal(response.expected, true)
  }
  const internal = apiErrorResponse(new Error("connect ECONNREFUSED 10.0.0.1"))
  assert.equal(internal.status, 500)
  assert.equal(internal.expected, false)
  assert.equal(internal.body.error.message, "Something went wrong")
})

test("v1 routes reject requests without a bearer token before reading the session", async () => {
  let called = false
  const GET = apiRoute(async () => {
    called = true
    return {}
  })
  for (const headers of <Record<string, string>[]>[
    {},
    { cookie: "__session=browser-cookie" },
    { authorization: "Basic abc" },
  ]) {
    const response = await GET(
      new NextRequest("http://localhost/api/v1/bots", { headers }),
      {}
    )
    assert.equal(response.status, 401)
    assert.equal(response.headers.get("cache-control"), "private, no-store")
    assert.deepEqual(await response.json(), {
      error: { code: "unauthorized", message: "Unauthorized" },
    })
  }
  assert.equal(called, false)
})

test("bots and chats sent to the app leave out owner and sandbox identifiers", () => {
  const shown = publicChat(chat("chat_1", "direct", [bot("quill")]))
  assert.equal("userId" in shown, false)
  assert.equal("userId" in shown.bots[0], false)
  assert.equal("sandboxId" in shown.bots[0], false)
  assert.equal(JSON.stringify(shown).includes("sbx_secret"), false)
  assert.deepEqual(Object.keys(publicBot(bot("quill"))).sort(), [
    "avatar",
    "createdAt",
    "id",
    "instructions",
    "job",
    "name",
    "pinnedAt",
    "setupComplete",
    "taskBudget",
  ])
})

test("presets sent to the app keep their ids and leave out instructions and icons", () => {
  const shown = botPresets.map(publicPreset)
  assert.deepEqual(
    shown.map((preset) => preset.id),
    botPresets.map((preset) => preset.id)
  )
  for (const preset of shown) {
    assert.equal("instructions" in preset, false)
    assert.equal("icon" in preset, false)
    assert.doesNotThrow(() => JSON.stringify(preset))
  }
})

test("sidebar sections pin bots in pin order and order the remaining conversations", () => {
  const first = bot("a", new Date("2026-01-01T00:00:00Z"))
  const second = bot("b", new Date("2026-01-03T00:00:00Z"))
  const loose = bot("c")
  const chats = [
    chat("chat_b", "direct", [second]),
    chat("chat_c", "direct", [loose]),
    chat("group", "group", [first, loose]),
    chat("chat_a", "direct", [first]),
  ]
  const { pinned, conversations } = sidebarSections(
    chats,
    [loose, second, first],
    ["chat_c", "group"]
  )
  assert.deepEqual(
    pinned.map(({ bot, chat, chatIds }) => [bot.id, chat.id, chatIds]),
    [
      ["a", "chat_a", ["chat_a"]],
      ["b", "chat_b", ["chat_b"]],
    ]
  )
  assert.deepEqual(
    conversations.map((chat) => chat.id),
    ["chat_c", "group"]
  )
})

test("desktop upgrades from browsers stay same-origin and cookie-authenticated", () => {
  const origin = "https://kraftybot.app"
  const url = new URL("/api/chats/c/desktop", origin)
  assert.deepEqual(
    desktopAuth({ origin: "https://evil.example", cookie: "a" }, url, origin),
    { ok: false, status: 403 }
  )
  const browser = desktopAuth(
    { origin, cookie: "__session=jwt", host: "kraftybot.app" },
    url,
    origin
  )
  assert.equal(browser.ok && browser.kind, "clerk")
  if (!browser.ok || browser.kind !== "clerk") return
  assert.deepEqual(browser.authorizedParties, [origin])
  assert.equal(browser.headers.get("cookie"), "__session=jwt")
})

test("desktop upgrades from native apps need a bearer header or a ticket, never a session token in the URL", () => {
  const origin = "https://kraftybot.app"
  const url = new URL("/api/chats/c/desktop", origin)
  assert.deepEqual(desktopAuth({ cookie: "__session=jwt" }, url, origin), {
    ok: false,
    status: 401,
  })
  const header = desktopAuth(
    { authorization: "Bearer native.jwt", cookie: "__session=jwt" },
    url,
    origin
  )
  assert.equal(header.ok && header.kind, "clerk")
  if (!header.ok || header.kind !== "clerk") return
  assert.equal(header.headers.get("authorization"), "Bearer native.jwt")
  assert.equal(header.headers.get("cookie"), null)
  assert.equal(header.authorizedParties, undefined)

  // The old ?token= form is ignored, so a session JWT in a URL opens nothing
  assert.deepEqual(
    desktopAuth(
      {},
      new URL("/api/chats/c/desktop?token=query.jwt", origin),
      origin
    ),
    { ok: false, status: 401 }
  )

  // A ticket is the whole credential: cookies are not read, any Origin works
  const ticket = desktopAuth(
    { origin: "null", cookie: "__session=jwt" },
    new URL("/api/chats/c/desktop?ticket=abc.def", origin),
    origin
  )
  assert.deepEqual(ticket, { ok: true, kind: "ticket", ticket: "abc.def" })
  assert.deepEqual(
    desktopAuth({}, new URL("/api/chats/c/desktop?ticket=", origin), origin),
    { ok: false, status: 401 }
  )
})

test("desktop tickets open one chat once, for one minute, for the user they name", () => {
  const secret = "sk_test_secret"
  const now = Date.UTC(2026, 9, 15)
  const issue = () =>
    createDesktopTicket({ userId: "user_a", chatId: "chat_a" }, secret, now)

  const { ticket, expiresAt } = issue()
  assert.equal(expiresAt, now + DESKTOP_TICKET_TTL_MS)
  const guard = new TicketReplayGuard()
  assert.deepEqual(verifyDesktopTicket(ticket, "chat_a", secret, guard, now), {
    userId: "user_a",
  })
  // Single use
  assert.equal(verifyDesktopTicket(ticket, "chat_a", secret, guard, now), null)

  // Another chat, another key, after expiry, or tampered: rejected
  const fresh = () => new TicketReplayGuard()
  assert.equal(
    verifyDesktopTicket(issue().ticket, "chat_b", secret, fresh(), now),
    null
  )
  assert.equal(
    verifyDesktopTicket(issue().ticket, "chat_a", "other", fresh(), now),
    null
  )
  assert.equal(
    verifyDesktopTicket(issue().ticket, "chat_a", secret, fresh(), expiresAt),
    null
  )
  const [body, signature] = issue().ticket.split(".")
  const forged = Buffer.from(
    JSON.stringify({
      ...JSON.parse(Buffer.from(body, "base64url").toString()),
      u: "user_b",
    })
  ).toString("base64url")
  assert.equal(
    verifyDesktopTicket(
      `${forged}.${signature}`,
      "chat_a",
      secret,
      fresh(),
      now
    ),
    null
  )
  for (const junk of ["", "a", "a.b.c", "....", `${body}.`])
    assert.equal(
      verifyDesktopTicket(junk, "chat_a", secret, fresh(), now),
      null
    )
  // A Clerk session JWT is not a ticket
  assert.equal(
    verifyDesktopTicket(
      "eyJhbGciOi.eyJzdWIiOi.c2ln",
      "chat_a",
      secret,
      fresh(),
      now
    ),
    null
  )
  assert.throws(() => createDesktopTicket({ userId: "u", chatId: "c" }, ""))
})

const jsonRequest = (body: BodyInit, headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost/api/v1/bots", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  })

test("request bodies must be small JSON, and an empty body reads as {}", async () => {
  assert.deepEqual(
    await readJson(new NextRequest("http://localhost/x", { method: "POST" })),
    {}
  )
  assert.deepEqual(await readJson(jsonRequest('{"a":1}')), { a: 1 })
  await assert.rejects(readJson(jsonRequest("{")), SyntaxError)
  await assert.rejects(
    readJson(jsonRequest('{"a":1}', { "content-type": "text/plain" })),
    (error: unknown) => error instanceof HttpError && error.status === 415
  )
  await assert.rejects(
    readJson(jsonRequest(JSON.stringify({ a: "x".repeat(70_000) }))),
    (error: unknown) => error instanceof HttpError && error.status === 413
  )
  // A chunked body with no Content-Length is cut off at the limit too
  const chunk = new TextEncoder().encode("x".repeat(16_000))
  let sent = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent++ < 10) controller.enqueue(chunk)
      else controller.close()
    },
  })
  await assert.rejects(
    readJson(
      new NextRequest("http://localhost/x", {
        method: "POST",
        body: stream,
        headers: { "content-type": "application/json" },
        duplex: "half",
      } as ConstructorParameters<typeof NextRequest>[1])
    ),
    (error: unknown) => error instanceof HttpError && error.status === 413
  )
  assert.ok(sent < 10)
})

test("API-level and newer service errors map to their own statuses", () => {
  const cases: [unknown, number, string, boolean][] = [
    [
      new HttpError(415, "unsupported_media_type", "JSON"),
      415,
      "unsupported_media_type",
      true,
    ],
    [
      new Error("Group chats require a paid plan."),
      403,
      "upgrade_required",
      true,
    ],
    [
      new Error("Pick between two and eight different bots."),
      400,
      "invalid_request",
      true,
    ],
    [
      new Error("That memory was changed at the same time."),
      409,
      "conflict",
      true,
    ],
    [new Error("Teammate not found"), 404, "not_found", true],
    // Already reported to Sentry by the service, and worded for the person
    [new Error("Couldn't load apps. Please try again."), 502, "upstream", true],
    [
      new Error("Couldn't cancel your subscription. Try again."),
      502,
      "upstream",
      true,
    ],
    [
      new Error("Couldn't close your conversations. Try again."),
      502,
      "upstream",
      true,
    ],
    // services/apple.ts
    [
      new Error("Couldn't revoke Sign in with Apple. Try again."),
      502,
      "upstream",
      true,
    ],
    [
      new Error("Couldn't save your Sign in with Apple. Try again."),
      502,
      "upstream",
      true,
    ],
    [
      new Error("Couldn't save your AI permission. Try again."),
      502,
      "upstream",
      true,
    ],
    [new Error("Apple account not found"), 404, "not_found", true],
  ]
  for (const [error, status, code, expected] of cases) {
    const response = apiErrorResponse(error)
    assert.deepEqual(
      [response.status, response.body.error.code, response.expected],
      [status, code, expected]
    )
  }
})

test("desktop socket URLs use the public host and the forwarded scheme", () => {
  const path = "/api/chats/chat%201/desktop"
  assert.equal(
    desktopSocketUrl(
      new Headers({ host: "kraftybot.app", "x-forwarded-proto": "https" }),
      path
    ),
    "wss://kraftybot.app/api/chats/chat%201/desktop"
  )
  assert.equal(
    desktopSocketUrl(new Headers({ host: "localhost:3000" }), path),
    "ws://localhost:3000/api/chats/chat%201/desktop"
  )
})

test("legacy paid-plan deletion conflicts remain mapped for older clients", () => {
  const response = apiErrorResponse(new Error(ACTIVE_PLAN_ERROR))
  assert.deepEqual(
    [response.status, response.body.error.code, response.expected],
    [409, "conflict", true]
  )
})

test("routine and approval errors map to stable codes", async () => {
  const { APPROVAL_DECIDED_ERROR, APPROVAL_EXPIRED_ERROR } =
    await import("../lib/approval-policy")
  const { ROUTINE_LIMIT_ERROR, PAID_ROUTINE_LIMIT_ERROR } =
    await import("../lib/routine-policy")
  for (const [message, status, code] of [
    [ROUTINE_LIMIT_ERROR, 403, "plan_limit"],
    [PAID_ROUTINE_LIMIT_ERROR, 403, "plan_limit"],
    [APPROVAL_DECIDED_ERROR, 409, "conflict"],
    [APPROVAL_EXPIRED_ERROR, 409, "conflict"],
    ["Pick a time in the future.", 400, "invalid_request"],
    [EVENT_ROUTINE_CHANGE_ERROR, 400, "invalid_request"],
    [eventConnectError("gmail"), 400, "invalid_request"],
    [
      eventAccountChoiceError("gmail", "Work (accountId ca_1)"),
      400,
      "invalid_request",
    ],
    ["Couldn't start watching gmail. Try again.", 502, "upstream"],
    ["Routine not found", 404, "not_found"],
    ["Approval not found", 404, "not_found"],
    [
      "The computer is busy with another operation. Try again shortly.",
      409,
      "conflict",
    ],
  ] as const) {
    const response = apiErrorResponse(new Error(message))
    assert.deepEqual(
      [response.status, response.body.error.code],
      [status, code],
      message
    )
  }
})

test("connect requests accept chat context, and questionId or botId without chatId is a 400", async () => {
  const { mobileConnectInputSchema } = await import("../lib/mobile-connector")
  const base = { slug: "gmail", returnUrl: "krafty://apps/connected" }
  assert.equal(mobileConnectInputSchema.safeParse(base).success, true)
  assert.equal(
    mobileConnectInputSchema.safeParse({
      ...base,
      chatId: "c",
      questionId: "call_1",
      botId: "b",
    }).success,
    true
  )
  for (const extra of [{ questionId: "call_1" }, { botId: "b" }]) {
    const bad = mobileConnectInputSchema.safeParse({ ...base, ...extra })
    assert.equal(bad.success, false)
    const response = apiErrorResponse(bad.error)
    assert.equal(response.status, 400)
    assert.equal(response.body.error.code, "invalid_request")
  }
  assert.equal(
    mobileConnectInputSchema.safeParse({ ...base, chatId: "c", questionId: "" })
      .success,
    false
  )
})

test("the complete route returns the service's { connected, woke } result", async () => {
  const { readFileSync } = await import("node:fs")
  const source = readFileSync(
    new URL(
      "../app/api/v1/apps/connections/complete/route.ts",
      import.meta.url
    ),
    "utf8"
  )
  assert.match(source, /return result/)
})

test("computer capacity and allowance messages map to retryable, calm responses", () => {
  const cases: [string, number, string][] = [
    // E2B quota, rate limit or concurrency cap (lib/e2b.ts mapProviderError)
    [
      "Computers are busy right now. Try again in a few minutes.",
      503,
      "upstream",
    ],
    // Computer time spent: the same 429 as the other usage limits
    [
      "Your free computer time is used up. Upgrade to keep using the computer.",
      429,
      "usage_limit",
    ],
    [
      "Your computer time for this billing period is used up. It resets when your next period starts.",
      429,
      "usage_limit",
    ],
    ["Your computer time is used up.", 429, "usage_limit"],
    // Unchanged
    ["Usage limit reached", 429, "usage_limit"],
    [
      "The computer is busy with another operation. Try again shortly.",
      409,
      "conflict",
    ],
  ]
  for (const [message, status, code] of cases) {
    const response = apiErrorResponse(new Error(message))
    assert.deepEqual(
      [response.status, response.body.error.code, response.body.error.message],
      [status, code, message]
    )
    // Already reported where it happened; not a server fault to page on
    assert.equal(response.expected, true)
  }
})
