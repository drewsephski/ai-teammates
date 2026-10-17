import * as Sentry from "@sentry/node"
import { and, asc, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import {
  bots,
  slackInstallations,
  slackSettingsSchema,
  slackThreads,
  type SlackSettings,
} from "@/db/schema"
import { postChatMessage } from "@/lib/chat-dispatch"
import {
  credentialStorageReady,
  openCredential,
  sealCredential,
} from "@/lib/credential-crypto"
import { siteUrl } from "@/lib/marketing/site"
import { checkBotRun, reportChat } from "@/lib/routines"
import {
  fromSlackText,
  isPersonMessage,
  parseSlackMessageId,
  pickSlackBot,
  SLACK_UNAVAILABLE_ERROR,
  slackMessageId,
  slackPrompt,
  slackReplyText,
  slackEventSchema,
  type SlackTurnOutcome,
} from "@/lib/slack-policy"
import { teamOperationId } from "@/lib/team-policy"

// Slack as a way to reach your bots. A person installs the Krafty app into
// their workspace; their direct messages to it and their mentions of it post
// into a bot's chat like a message from the composer, and the bot's reply is
// posted back to the Slack thread when the turn ends (trigger/chat.ts). Only
// the member who installed it is answered: anyone else in the workspace would
// otherwise spend the owner's allowance and act with their connected apps.

type Fetch = typeof fetch

export function slackConfig() {
  const clientId = process.env.SLACK_CLIENT_ID?.trim()
  const clientSecret = process.env.SLACK_CLIENT_SECRET?.trim()
  const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim()
  if (!clientId || !clientSecret || !signingSecret || !credentialStorageReady())
    return null
  return { clientId, clientSecret, signingSecret }
}

export function requireSlackConfig() {
  const config = slackConfig()
  if (!config) throw new Error(SLACK_UNAVAILABLE_ERROR)
  return config
}

const tokenContext = (userId: string, teamId: string) =>
  `slack:${userId}:${teamId}`

const slackResponse = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
})

async function slackApi(
  method: string,
  token: string,
  body: Record<string, unknown>,
  fetchImpl: Fetch = fetch
) {
  const response = await fetchImpl(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  const data = slackResponse.parse(await response.json())
  if (!data.ok) throw new Error(`Slack ${method} failed: ${data.error}`)
}

const oauthResult = z.object({
  ok: z.literal(true),
  access_token: z.string().min(1),
  bot_user_id: z.string().min(1),
  team: z.object({ id: z.string().min(1), name: z.string() }),
  authed_user: z.object({ id: z.string().min(1) }),
})

// Finishes the install: trades Slack's code for the bot token and binds the
// workspace member who approved it to this account. One workspace per account;
// installing again replaces it.
export async function completeSlackInstall(
  userId: string,
  { code, redirectUri }: { code: string; redirectUri: string },
  fetchImpl: Fetch = fetch
) {
  const config = requireSlackConfig()
  let result: z.infer<typeof oauthResult>
  try {
    const response = await fetchImpl("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    result = oauthResult.parse(await response.json())
  } catch (cause) {
    Sentry.captureException(cause)
    throw new Error("Couldn't connect Slack. Try again.")
  }
  const values = {
    teamId: result.team.id,
    teamName: result.team.name,
    slackUserId: result.authed_user.id,
    botUserId: result.bot_user_id,
    botToken: sealCredential(
      result.access_token,
      tokenContext(userId, result.team.id)
    ),
  }
  await db.transaction(async (tx) => {
    // The same Slack member can't reach two Krafty accounts
    await tx
      .delete(slackInstallations)
      .where(
        and(
          eq(slackInstallations.teamId, values.teamId),
          eq(slackInstallations.slackUserId, values.slackUserId)
        )
      )
    await tx
      .insert(slackInstallations)
      .values({ userId, ...values })
      .onConflictDoUpdate({
        target: slackInstallations.userId,
        set: { ...values, botId: null },
      })
  })
  return getSlackStatus(userId)
}

export async function getSlackStatus(userId: string) {
  const [row] = await db
    .select({
      teamName: slackInstallations.teamName,
      botId: slackInstallations.botId,
      createdAt: slackInstallations.createdAt,
    })
    .from(slackInstallations)
    .where(eq(slackInstallations.userId, userId))
  return {
    available: !!slackConfig(),
    connected: !!row,
    teamName: row?.teamName ?? null,
    // Who answers a message that doesn't name a bot; null is the first bot
    botId: row?.botId ?? null,
    connectedAt: row?.createdAt ?? null,
  }
}
export type SlackStatus = Awaited<ReturnType<typeof getSlackStatus>>

export async function updateSlackSettings(
  userId: string,
  input: SlackSettings
) {
  const { botId } = slackSettingsSchema.parse(input)
  if (botId) {
    const [bot] = await db
      .select({ id: bots.id })
      .from(bots)
      .where(and(eq(bots.id, botId), eq(bots.userId, userId)))
    if (!bot) throw new Error("Bot not found")
  }
  const [row] = await db
    .update(slackInstallations)
    .set({ botId })
    .where(eq(slackInstallations.userId, userId))
    .returning({ userId: slackInstallations.userId })
  if (!row) throw new Error("Slack connection not found")
  return getSlackStatus(userId)
}

// Removes the workspace and revokes the token. A failed revoke still removes
// it here: the token is useless without the row that holds it.
export async function disconnectSlack(
  userId: string,
  fetchImpl: Fetch = fetch
) {
  const [row] = await db
    .delete(slackInstallations)
    .where(eq(slackInstallations.userId, userId))
    .returning()
  if (!row) return getSlackStatus(userId)
  try {
    await slackApi(
      "auth.revoke",
      openCredential(row.botToken, tokenContext(userId, row.teamId)),
      {},
      fetchImpl
    )
  } catch (cause) {
    Sentry.captureException(cause)
  }
  return getSlackStatus(userId)
}

// What a Slack event needs from outside the database. Injected so tests run
// without Slack, Trigger.dev or Clerk.
export type SlackEventDeps = {
  post: typeof postChatMessage
  check: (userId: string, botId: string) => Promise<string | undefined>
  reply: (
    installation: typeof slackInstallations.$inferSelect,
    target: { channel: string; threadTs: string },
    text: string
  ) => Promise<void>
}

async function replyInSlack(
  installation: typeof slackInstallations.$inferSelect,
  target: { channel: string; threadTs: string },
  text: string
) {
  await slackApi(
    "chat.postMessage",
    openCredential(
      installation.botToken,
      tokenContext(installation.userId, installation.teamId)
    ),
    {
      channel: target.channel,
      thread_ts: target.threadTs,
      text,
      unfurl_links: false,
    }
  )
}

const liveEventDeps: SlackEventDeps = {
  post: postChatMessage,
  check: checkBotRun,
  reply: replyInSlack,
}

export type SlackEventResult =
  "ignored" | "not_installed" | "no_bot" | "skipped" | "posted"

// Handles one verified Events API callback
export async function handleSlackEvent(
  payload: unknown,
  deps: SlackEventDeps = liveEventDeps
): Promise<SlackEventResult> {
  const parsed = slackEventSchema.safeParse(payload)
  if (!parsed.success || !isPersonMessage(parsed.data.event)) return "ignored"
  const { team_id: teamId, event } = parsed.data
  const [installation] = await db
    .select()
    .from(slackInstallations)
    .where(
      and(
        eq(slackInstallations.teamId, teamId),
        eq(slackInstallations.slackUserId, event.user!)
      )
    )
  if (!installation) return "not_installed"
  const text = fromSlackText(event.text ?? "", installation.botUserId)
  if (!text) return "ignored"
  const target = {
    channel: event.channel,
    threadTs: event.thread_ts ?? event.ts,
  }

  const owned = await db
    .select({ id: bots.id, name: bots.name })
    .from(bots)
    .where(eq(bots.userId, installation.userId))
    .orderBy(asc(bots.createdAt), asc(bots.id))
  const [thread] = event.thread_ts
    ? await db
        .select({ botId: slackThreads.botId })
        .from(slackThreads)
        .where(
          and(
            eq(slackThreads.teamId, teamId),
            eq(slackThreads.channel, event.channel),
            eq(slackThreads.threadTs, event.thread_ts)
          )
        )
    : []
  // pickSlackBot only picks among this owner's bots
  const picked = pickSlackBot(text, owned, installation.botId, thread?.botId)
  if (!picked) {
    await deps.reply(
      installation,
      target,
      `You don't have a bot yet. <${siteUrl}/workspace|Create one in Krafty>.`
    )
    return "no_bot"
  }
  const reason = await deps.check(installation.userId, picked.bot.id)
  if (reason) {
    await deps.reply(
      installation,
      target,
      `${picked.bot.name} can't start: ${reason}`
    )
    return "skipped"
  }
  const messageId = slackMessageId({
    teamId,
    channel: event.channel,
    ts: event.ts,
    threadTs: event.thread_ts,
  })
  const chatId = await reportChat(
    installation.userId,
    picked.bot.id,
    teamOperationId(installation.userId, "slack-chat", picked.bot.id)
  )
  await deps.post(
    chatId,
    {
      id: messageId,
      text: slackPrompt(picked.text),
      displayPrompt: picked.text.slice(0, 500),
    },
    { botId: picked.bot.id }
  )
  const threadKey = {
    teamId,
    channel: event.channel,
    threadTs: target.threadTs,
  }
  await db
    .insert(slackThreads)
    .values({ ...threadKey, botId: picked.bot.id })
    .onConflictDoUpdate({
      target: [
        slackThreads.teamId,
        slackThreads.channel,
        slackThreads.threadTs,
      ],
      set: { botId: picked.bot.id },
    })
  return "posted"
}

// Posts a finished turn back to the Slack thread its message came from. Only
// that owner's installation, and only the workspace the message came from.
export async function postSlackTurnReply(
  userId: string,
  messageId: string | undefined,
  turn: { chatId: string; botName: string; outcome: SlackTurnOutcome },
  fetchImpl: Fetch = fetch
) {
  const target = parseSlackMessageId(messageId)
  if (!target) return { posted: false as const }
  const [installation] = await db
    .select()
    .from(slackInstallations)
    .where(
      and(
        eq(slackInstallations.userId, userId),
        eq(slackInstallations.teamId, target.teamId)
      )
    )
  if (!installation) return { posted: false as const }
  await slackApi(
    "chat.postMessage",
    openCredential(
      installation.botToken,
      tokenContext(userId, installation.teamId)
    ),
    {
      channel: target.channel,
      thread_ts: target.threadTs,
      text: slackReplyText(
        turn.outcome,
        turn.botName,
        `${siteUrl}/chats/${turn.chatId}`
      ),
      unfurl_links: false,
    },
    fetchImpl
  )
  return { posted: true as const }
}
