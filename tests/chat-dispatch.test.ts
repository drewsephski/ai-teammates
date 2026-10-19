import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import test, { mock } from "node:test"

import { sessions } from "@trigger.dev/sdk"

import { postChatMessage } from "../lib/chat-dispatch"
import { openMessage, SEALED_PART_TYPE } from "../lib/chat-content-seal"

const key = randomBytes(32)

type InputRecord = {
  kind: string
  payload: {
    message: {
      id: string
      role: string
      parts: { type: string; text?: string }[]
      metadata?: unknown
    }
  }
}

async function post(
  message: Parameters<typeof postChatMessage>[1],
  options: Parameters<typeof postChatMessage>[2] = {},
  {
    started = {},
    inputRecords = [],
  }: { started?: object; inputRecords?: { id: string; seqNum: number }[] } = {}
) {
  const starts: unknown[] = []
  mock.method(sessions, "start", async (body: unknown) => {
    starts.push(body)
    return { publicAccessToken: "pat_1", ...started }
  })
  process.env.TRIGGER_SECRET_KEY = "tr_test"
  const raw: string[] = []
  const appends: InputRecord[] = []
  const headers: Record<string, string>[] = []
  try {
    const result = await postChatMessage("chat_1", message, {
      botId: "bot_1",
      contentKey: async () => key,
      ...options,
      fetchImpl: (async (url: string, init: RequestInit = {}) => {
        if (url.includes("/in/records")) {
          const after = new URL(url).searchParams.get("afterEventId")
          return Response.json({ records: after ? [] : inputRecords })
        }
        raw.push(init.body as string)
        appends.push(JSON.parse(init.body as string))
        headers.push(init.headers as Record<string, string>)
        return new Response('{"seq":7}', { status: 200 })
      }) as unknown as typeof fetch,
    })
    return { result, raw, appends, headers, starts }
  } finally {
    mock.restoreAll()
  }
}

const opened = (record: InputRecord) =>
  openMessage(record.payload.message, "chat_1", key)

test("the message text is sealed: it never reaches Trigger.dev in the clear", async () => {
  const { raw, appends, starts } = await post({
    id: "routine_1",
    text: "Summarize my inbox from Alice",
    displayPrompt: "Inbox summary",
  })
  assert.equal(raw.length, 1)
  assert.doesNotMatch(raw[0], /Alice|Inbox summary/)
  assert.deepEqual(
    appends[0].payload.message.parts.map((part) => part.type),
    [SEALED_PART_TYPE]
  )
  // The session is started empty: basePayload text stays at Trigger.dev
  assert.doesNotMatch(JSON.stringify(starts), /Alice/)
  assert.deepEqual(
    (starts[0] as { triggerConfig: { basePayload: unknown } }).triggerConfig
      .basePayload,
    { chatId: "chat_1", trigger: "preload" }
  )
  assert.deepEqual(opened(appends[0]).parts, [
    { type: "text", text: "Summarize my inbox from Alice" },
  ])
})

test("displayPrompt and questionId travel together in the message metadata", async () => {
  const { appends, headers } = await post({
    id: "connect_s1",
    text: "Connected",
    displayPrompt: "Connected Gmail",
    questionId: "call_9",
  })
  assert.deepEqual(opened(appends[0]).metadata, {
    displayPrompt: "Connected Gmail",
    questionId: "call_9",
  })
  assert.equal(headers[0]["X-Part-Id"], "connect_s1")
})

test("only the metadata keys that are set are sent", async () => {
  assert.deepEqual(
    opened((await post({ id: "a", text: "x", questionId: "q" })).appends[0])
      .metadata,
    { questionId: "q" }
  )
  assert.equal(
    opened((await post({ id: "b", text: "x" })).appends[0]).metadata,
    undefined
  )
})

test("session metadata and tags go to the session start", async () => {
  const { starts } = await post(
    { id: "task_1", text: "x" },
    { tags: ["for-you"], metadata: { forYou: { toolkit: "gmail" } } }
  )
  assert.deepEqual(starts[0], {
    type: "chat.agent",
    externalId: "chat_1",
    taskIdentifier: "chat",
    metadata: { forYou: { toolkit: "gmail" } },
    triggerConfig: {
      tags: ["chat:chat_1", "for-you"],
      basePayload: { chatId: "chat_1", trigger: "preload" },
    },
  })
})

test("a once message is not posted again to a session that already has it", async () => {
  const again = await post(
    { id: "brief_1", text: "x" },
    { once: true },
    {
      started: { isCached: true },
      inputRecords: [{ id: "brief_1", seqNum: 3 }],
    }
  )
  assert.equal(again.appends.length, 0)
  assert.deepEqual(again.result, { publicAccessToken: "pat_1" })

  // An earlier attempt created the session but never appended
  const retry = await post(
    { id: "brief_1", text: "x" },
    { once: true },
    { started: { isCached: true }, inputRecords: [{ id: "other", seqNum: 1 }] }
  )
  assert.equal(retry.appends.length, 1)
  assert.deepEqual(retry.result, { inputSeq: 7, publicAccessToken: "pat_1" })

  // A new session always gets it, without reading the input stream
  const fresh = await post(
    { id: "brief_1", text: "x" },
    { once: true },
    { inputRecords: [{ id: "brief_1", seqNum: 3 }] }
  )
  assert.equal(fresh.appends.length, 1)
})

test("nothing is sent to a chat that no longer exists", async () => {
  await assert.rejects(
    post({ id: "routine_2", text: "x" }, { contentKey: async () => undefined }),
    /Chat not found/
  )
})
