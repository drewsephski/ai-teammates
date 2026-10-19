// Live check of chat erasure against Trigger.dev's development environment
// (lib/trigger-session-erasure.ts, lib/chat-content-seal.ts). Spends nothing:
// no model calls and no database writes. The throwaway session's run stays
// queued unless a `trigger dev` worker is connected, and is cancelled.
//
//   pnpm exec tsx --env-file=.env.local scripts/verify-trigger-erasure.ts
import { randomBytes, randomUUID } from "node:crypto"
import { configure, runs, sessions } from "@trigger.dev/sdk"

import { openMessage, sealInputRecord } from "../lib/chat-content-seal"
import {
  eraseChatSession,
  triggerErasureSteps,
} from "../lib/trigger-session-erasure"

const secret = process.env.TRIGGER_SECRET_KEY ?? ""
if (!secret.startsWith("tr_dev_"))
  throw new Error("Run this against the development environment only")
configure({ accessToken: secret })
const base = process.env.TRIGGER_API_URL ?? "https://api.trigger.dev"
const auth = { Authorization: `Bearer ${secret}` }

const chatId = `verify-erasure-${randomUUID()}`
const key = randomBytes(32)
const secretText = `erasure check ${randomUUID()}`
let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures++
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`)
}

async function drain(io: "in" | "out") {
  const response = await fetch(
    `${base}/realtime/v1/sessions/${chatId}/${io}/records`,
    { headers: auth }
  )
  if (!response.ok) throw new Error(`drain ${io}: ${response.status}`)
  return ((await response.json()) as { records: { data: string }[] }).records
    .map((record) => record.data)
    .filter(Boolean)
}

async function transcript() {
  const response = await fetch(`${base}/api/v1/sessions/${chatId}/transcript`, {
    headers: auth,
  })
  return ((await response.json()) as { messages?: unknown[] }).messages ?? []
}

const started = await sessions.start({
  type: "chat.agent",
  externalId: chatId,
  taskIdentifier: "chat",
  triggerConfig: {
    tags: ["verify-erasure"],
    basePayload: { chatId, trigger: "preload" },
  },
})
console.log(`session ${chatId}`)
if (started.runId) await runs.cancel(started.runId).catch(() => {})

// What a client send looks like once the proxy has sealed it
const sealedBody = sealInputRecord(
  JSON.stringify({
    kind: "message",
    payload: {
      chatId,
      trigger: "submit-message",
      message: {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: secretText }],
      },
    },
  }),
  chatId,
  key
)!
await fetch(`${base}/realtime/v1/sessions/${chatId}/in/append`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json", "X-Part-Id": "m1" },
  body: sealedBody,
})
await fetch(`${base}/realtime/v1/sessions/${chatId}/out/append`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "text-delta", id: "t", delta: secretText }),
})
// A legacy snapshot, as chat.agent's default storage wrote them
const presign = await fetch(`${base}/api/v1/sessions/${chatId}/snapshot-url`, {
  method: "PUT",
  headers: auth,
})
const { presignedUrl } = (await presign.json()) as { presignedUrl: string }
await fetch(presignedUrl, {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    version: 2,
    savedAt: Date.now(),
    messages: [
      {
        id: "m0",
        final: true,
        message: {
          id: "m0",
          role: "user",
          parts: [{ type: "text", text: secretText }],
        },
      },
    ],
    state: null,
  }),
})

const input = await drain("in")
check(
  "the input stream holds the message only as ciphertext",
  input.length > 0 && input.every((data) => !data.includes(secretText))
)
const stored = JSON.parse(input[0]) as {
  payload: { message: Parameters<typeof openMessage>[0] }
}
check(
  "it opens with the chat's key",
  JSON.stringify(openMessage(stored.payload.message, chatId, key)).includes(
    secretText
  )
)
check(
  "and not without it",
  (() => {
    try {
      openMessage(stored.payload.message, chatId, randomBytes(32))
      return false
    } catch {
      return true
    }
  })()
)
check(
  "the legacy snapshot is served before erasure",
  (await transcript()).length === 1
)

const result = await eraseChatSession(chatId, "verify-erasure")
check("erasure completes", result === "erased", result)
check("the transcript is empty afterwards", (await transcript()).length === 0)
const session = await sessions.retrieve(chatId)
check("the session is closed", session.closedAt !== null)
check(
  "metadata and tags hold only the erasure marker",
  JSON.stringify(session.tags) === '["erased"]' &&
    typeof session.metadata?.erasedAt === "string" &&
    Object.keys(session.metadata ?? {}).length === 1
)
check(
  "a second erasure is a no-op",
  (await eraseChatSession(chatId, "verify-erasure")) === "already erased"
)
// S2 deletes trimmed records eventually; the drain may still list them
const output = await drain("out")
console.log(
  `info .out drain lists ${output.length} record(s) right after the trim; S2 trims are eventually consistent`
)
await triggerErasureSteps.verify(chatId)

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed")
process.exit(failures ? 1 : 0)
