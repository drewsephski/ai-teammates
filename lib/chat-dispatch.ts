import { sessions } from "@trigger.dev/sdk"

import { sealInputRecord } from "@/lib/chat-content-seal"

// The same configuration the SDK's own API client reads
function triggerAccess() {
  const baseURL = process.env.TRIGGER_API_URL ?? "https://api.trigger.dev"
  const accessToken =
    process.env.TRIGGER_SECRET_KEY ?? process.env.TRIGGER_ACCESS_TOKEN
  if (!accessToken) throw new Error("Trigger.dev is not configured")
  return { baseURL, accessToken }
}

// Imported on first use, so modules that only build messages don't open a
// database connection
async function defaultContentKey(chatId: string) {
  const { ensureChatContentKey } = await import("@/lib/chat-content-key")
  return ensureChatContentKey(chatId)
}

// Whether the session's input stream already holds a record appended with
// this part ID. The drain endpoint pages oldest first.
async function inputHasPart(
  chatId: string,
  partId: string,
  fetchImpl: typeof fetch
) {
  const { baseURL, accessToken } = triggerAccess()
  let after: number | undefined
  for (let page = 0; page < 50; page++) {
    const response = await fetchImpl(
      `${baseURL}/realtime/v1/sessions/${encodeURIComponent(chatId)}/in/records${after === undefined ? "" : `?afterEventId=${after}`}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15_000),
      }
    )
    if (!response.ok)
      throw new Error(`Couldn't reach the bot (${response.status})`)
    const { records } = (await response.json()) as {
      records: { id?: string; seqNum: number }[]
    }
    if (records.some((record) => record.id === partId)) return true
    if (records.length === 0) return false
    after = records.at(-1)!.seqNum
  }
  return false
}

// Posts a user-role message into a chat from the server, as if sent from the
// composer, and wakes the chat agent for it. Routines, approval decisions, the
// setup greeting, delegation briefs and For you tasks use this; the person
// isn't there to press send.
//
// A message to an existing session must go to its input channel: re-starting
// the session with a basePayload message is silently dropped once the session
// exists. The text never goes in basePayload either: Trigger.dev keeps it on
// the session and its runs with no way to delete it. The input record is
// sealed with the chat's key instead (lib/chat-content-seal.ts).
//
// The message ID doubles as the append's idempotency key, so a retried
// dispatch never posts twice. `once` is for a message that belongs to the
// session's creation (greeting, brief, task): when the session already
// existed, it is sent only if no earlier attempt appended it.
export async function postChatMessage(
  chatId: string,
  message: {
    id: string
    text: string
    displayPrompt?: string
    // The toolCallId of the question this message answers
    questionId?: string
  },
  options: {
    botId?: string
    // Server-trusted session metadata (For you binding, delegation depth),
    // set when this call creates the session
    metadata?: Record<string, unknown>
    tags?: string[]
    once?: boolean
    fetchImpl?: typeof fetch
    contentKey?: (chatId: string) => Promise<Buffer | undefined>
  } = {}
  // void keeps callers' fakes that resolve to nothing assignable
): Promise<{ inputSeq?: number; publicAccessToken?: string } | void> {
  const fetchImpl = options.fetchImpl ?? fetch
  const started = (await sessions.start({
    type: "chat.agent",
    externalId: chatId,
    taskIdentifier: "chat",
    ...(options.metadata && { metadata: options.metadata }),
    triggerConfig: {
      tags: [`chat:${chatId}`, ...(options.tags ?? [])],
      basePayload: { chatId, trigger: "preload" },
    },
  })) as { isCached?: boolean; publicAccessToken?: string } | undefined
  const publicAccessToken = started?.publicAccessToken

  if (
    options.once &&
    started?.isCached &&
    (await inputHasPart(chatId, message.id, fetchImpl))
  )
    return { publicAccessToken }

  const key = await (options.contentKey ?? defaultContentKey)(chatId)
  if (!key) throw new Error("Chat not found")
  const body = sealInputRecord(
    JSON.stringify({
      kind: "message",
      payload: {
        chatId,
        trigger: "submit-message",
        message: {
          id: message.id,
          role: "user",
          parts: [{ type: "text", text: message.text }],
          ...((message.displayPrompt || message.questionId) && {
            metadata: {
              ...(message.displayPrompt && {
                displayPrompt: message.displayPrompt,
              }),
              ...(message.questionId && { questionId: message.questionId }),
            },
          }),
        },
        ...(options.botId && { metadata: { botId: options.botId } }),
      },
    }),
    chatId,
    key
  )!

  const { baseURL, accessToken } = triggerAccess()
  const response = await fetchImpl(
    `${baseURL}/realtime/v1/sessions/${encodeURIComponent(chatId)}/in/append`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "x-trigger-source": "sdk",
        "X-Part-Id": message.id,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    }
  )
  if (!response.ok)
    throw new Error(`Couldn't reach the bot (${response.status})`)
  // The appended record's input seq. A watching browser passes it to the
  // transport so it streams this turn instead of the previous one's end.
  const data = (await response.json().catch(() => undefined)) as
    { seq?: unknown } | undefined
  return {
    inputSeq: typeof data?.seq === "number" ? data.seq : undefined,
    publicAccessToken,
  }
}
