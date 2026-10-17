import { createHmac, timingSafeEqual } from "node:crypto"
import { z } from "zod"

// Pure rules for talking to bots from Slack: request signatures, which bot a
// message is for, and the formats between Slack and the chat. No database,
// provider SDK or Next.js import.

export const SLACK_UNAVAILABLE_ERROR = "Slack isn't set up yet."

// Read mentions and direct messages, reply in threads. Nothing else.
export const SLACK_BOT_SCOPES = [
  "app_mentions:read",
  "chat:write",
  "im:history",
  "im:read",
  "im:write",
]

export function slackAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  state: string
) {
  const url = new URL("https://slack.com/oauth/v2/authorize")
  url.searchParams.set("client_id", clientId)
  url.searchParams.set("scope", SLACK_BOT_SCOPES.join(","))
  url.searchParams.set("redirect_uri", redirectUri)
  url.searchParams.set("state", state)
  return url.href
}

// Slack signs `v0:<timestamp>:<raw body>` with the app's signing secret.
// Requests older than five minutes are refused, so a captured one can't be
// replayed later.
export function verifySlackSignature(
  signingSecret: string,
  {
    timestamp,
    signature,
    body,
  }: { timestamp: string | null; signature: string | null; body: string },
  now = Date.now()
) {
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return false
  if (Math.abs(now / 1000 - Number(timestamp)) > 60 * 5) return false
  const expected = `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

const slackId = z.string().regex(/^[A-Z0-9]{2,30}$/)
const slackTs = z.string().regex(/^\d{6,12}\.\d{1,8}$/)

// The parts of an Events API callback a bot answers: a mention in a channel
// or a direct message to the app. Everything else is acknowledged and ignored.
export const slackEventSchema = z.object({
  type: z.literal("event_callback"),
  team_id: slackId,
  event: z.object({
    type: z.enum(["app_mention", "message"]),
    channel_type: z.string().optional(),
    subtype: z.string().optional(),
    bot_id: z.string().optional(),
    user: slackId.optional(),
    text: z.string().max(40_000).optional(),
    channel: slackId,
    ts: slackTs,
    thread_ts: slackTs.optional(),
  }),
})
export type SlackEvent = z.infer<typeof slackEventSchema>

// Whether a person wrote this to the app: a mention, or a direct message.
// Bot posts (the app's own replies included) and edits are ignored.
export function isPersonMessage(event: SlackEvent["event"]) {
  if (event.bot_id || event.subtype || !event.user) return false
  return (
    event.type === "app_mention" ||
    (event.type === "message" && event.channel_type === "im")
  )
}

// The message ID of a Slack message posted into a chat. It says where the
// reply goes (the thread) and, with the message's own ts, is the append's
// idempotency key, so Slack's retries post once.
export function slackMessageId(event: {
  teamId: string
  channel: string
  ts: string
  threadTs?: string
}) {
  return `slack_${event.teamId}_${event.channel}_${event.threadTs ?? event.ts}_${event.ts}`
}

export function parseSlackMessageId(messageId: string | undefined) {
  const match = /^slack_([A-Z0-9]+)_([A-Z0-9]+)_(\d+\.\d+)_(\d+\.\d+)$/.exec(
    messageId ?? ""
  )
  return match
    ? { teamId: match[1], channel: match[2], threadTs: match[3], ts: match[4] }
    : undefined
}

// Slack's message markup to plain text: the app's own mention removed,
// links spelled out and entities decoded
export function fromSlackText(text: string, botUserId: string) {
  return text
    .replaceAll(`<@${botUserId}>`, "")
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2 ($1)")
    .replace(/<(https?:[^>]+)>/g, "$1")
    .replace(/<mailto:([^|>]+)\|[^>]+>/g, "$1")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .trim()
}

type NamedBot = { id: string; name: string }

// Which bot a message is for. "Scout: check the build" or "Scout, ..." goes
// to Scout and drops the name; a reply in a thread goes to the bot already
// answering there; anything else goes to the default bot, or the first one.
export function pickSlackBot(
  text: string,
  bots: readonly NamedBot[],
  defaultBotId?: string | null,
  threadBotId?: string
) {
  const named = [...bots]
    .sort((a, b) => b.name.length - a.name.length)
    .find((bot) => {
      const prefix = text.slice(0, bot.name.length)
      return (
        prefix.toLowerCase() === bot.name.toLowerCase() &&
        /^\s*[:,]/.test(text.slice(bot.name.length))
      )
    })
  if (named)
    return {
      bot: named,
      text: text
        .slice(named.name.length)
        .replace(/^\s*[:,]\s*/, "")
        .trim(),
    }
  const bot =
    bots.find((bot) => bot.id === threadBotId) ??
    bots.find((bot) => bot.id === defaultBotId) ??
    bots[0]
  return bot ? { bot, text } : undefined
}

// What the bot reads: the person's words, and where its reply will go
export function slackPrompt(text: string) {
  return [
    "Sent from Slack. Your final reply is posted back to the Slack thread, so keep it short and lead with the answer. Formatting is limited to bold, italics, lists, code and links.",
    "",
    text,
  ].join("\n")
}

const SLACK_TEXT_LIMIT = 3500

// Chat markdown to Slack's mrkdwn
export function toSlackMarkdown(markdown: string) {
  const text = markdown
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "<$2|$1>")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/\*\*([^*\n]+)\*\*/g, "*$1*")
    .replace(/__([^_\n]+)__/g, "_$1_")
  return text.length > SLACK_TEXT_LIMIT
    ? `${text.slice(0, SLACK_TEXT_LIMIT)}…`
    : text
}

export type SlackTurnOutcome =
  | { kind: "reply"; text: string }
  | { kind: "question"; question: string }
  | { kind: "approval" }
  | { kind: "failed"; reason: string }

// The message posted back to the Slack thread when the turn ends
export function slackReplyText(
  outcome: SlackTurnOutcome,
  botName: string,
  chatUrl: string
) {
  const open = `<${chatUrl}|Open in Krafty>`
  switch (outcome.kind) {
    case "reply":
      return outcome.text.trim()
        ? `${toSlackMarkdown(outcome.text)}\n\n${open}`
        : `${botName} finished. ${open}`
    case "question":
      return `${toSlackMarkdown(outcome.question)}\n\nReply in this thread to answer. ${open}`
    case "approval":
      return `${botName} is waiting for your approval before it continues. ${open}`
    case "failed":
      return `${botName} couldn't finish: ${outcome.reason} ${open}`
  }
}
