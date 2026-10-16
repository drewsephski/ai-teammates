import { sessions } from "@trigger.dev/sdk"

// Posts a user-role message into a chat from the server, as if sent from the
// composer, and wakes the chat agent for it. Routines and approval decisions
// use this; the person isn't there to press send.
//
// A message to an existing session must go to its input channel: re-starting
// the session with a basePayload message is silently dropped once the session
// exists. The message ID doubles as the append's idempotency key, so a
// retried dispatch never posts twice.
export async function postChatMessage(
  chatId: string,
  message: { id: string; text: string; displayPrompt?: string },
  options: { botId?: string; fetchImpl?: typeof fetch } = {}
) {
  await sessions.start({
    type: "chat.agent",
    externalId: chatId,
    taskIdentifier: "chat",
    triggerConfig: {
      tags: [`chat:${chatId}`],
      basePayload: { chatId, trigger: "preload" },
    },
  })

  // The same configuration the SDK's own API client reads
  const baseURL = process.env.TRIGGER_API_URL ?? "https://api.trigger.dev"
  const accessToken =
    process.env.TRIGGER_SECRET_KEY ?? process.env.TRIGGER_ACCESS_TOKEN
  if (!accessToken) throw new Error("Trigger.dev is not configured")

  const response = await (options.fetchImpl ?? fetch)(
    `${baseURL}/realtime/v1/sessions/${encodeURIComponent(chatId)}/in/append`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "x-trigger-source": "sdk",
        "X-Part-Id": message.id,
      },
      body: JSON.stringify({
        kind: "message",
        payload: {
          chatId,
          trigger: "submit-message",
          message: {
            id: message.id,
            role: "user",
            parts: [{ type: "text", text: message.text }],
            ...(message.displayPrompt && {
              metadata: { displayPrompt: message.displayPrompt },
            }),
          },
          ...(options.botId && { metadata: { botId: options.botId } }),
        },
      }),
      signal: AbortSignal.timeout(15_000),
    }
  )
  if (!response.ok)
    throw new Error(`Couldn't reach the bot (${response.status})`)
}
