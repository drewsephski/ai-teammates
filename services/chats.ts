import * as Sentry from "@sentry/nextjs"
import { ApiError as TriggerApiError, auth, runs, sessions } from "@trigger.dev/sdk"
import {
  chat,
  defaultStorage,
  type ChatStartSessionParams,
} from "@trigger.dev/sdk/ai"
import { and, asc, desc, eq, inArray, notInArray } from "drizzle-orm"

import { db } from "@/db"
import {
  bots,
  chatMembers,
  chats,
  groupChatInsertSchema,
  sidebarPreferences,
  type GroupChatInsert,
} from "@/db/schema"
import type { Feature } from "@/lib/billing"
import { chatTurnState } from "@/lib/chat-turn"
import { getBotSandboxInfo, pauseBotSandbox, resetBotSandbox } from "@/lib/e2b"
import { SandboxMissingError } from "@/lib/sandbox-lifecycle"
import type { ChatUIMessage } from "@/lib/sandbox-tools"
import { sidebarOrderSchema } from "@/lib/sidebar-order"
import { getUsage } from "@/lib/usage"
import { assertBotAccess, provisionGroup } from "@/lib/teammates"
import type { chatAgent } from "@/trigger/chat"
import { startBotSetupSession } from "@/lib/bot-setup-session"
import { teamOperationId } from "@/lib/team-policy"
import { ensureBotComputer } from "@/lib/bot-computer"
import type { Caller } from "@/services/caller"

const startSession = chat.createStartSessionAction<typeof chatAgent>("chat")
const loadStoredTranscript = chat.createLoadTranscriptAction(defaultStorage)

// The user's chats, most recent first, each with the bots in it
export async function listChats(userId: string) {
  const rows = await db.query.chats.findMany({
    where: eq(chats.userId, userId),
    orderBy: desc(chats.lastMessageAt),
    with: {
      // Group members join together, so the bot ID settles the order
      members: {
        orderBy: [asc(chatMembers.joinedAt), asc(chatMembers.botId)],
        with: { bot: true },
      },
    },
  })

  // A chat whose bots were all deleted has nobody to show
  return rows.flatMap(({ members, ...chat }) =>
    members.length > 0
      ? [{ ...chat, bots: members.map((member) => member.bot) }]
      : []
  )
}

export type ChatWithBots = Awaited<ReturnType<typeof listChats>>[number]

// One of the user's chats with the bots in it, or null if it isn't theirs
export async function findChat(userId: string, chatId: string) {
  const row = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.userId, userId)),
    with: {
      // Group members join together, so the bot ID settles the order
      members: {
        orderBy: [asc(chatMembers.joinedAt), asc(chatMembers.botId)],
        with: { bot: true },
      },
    },
  })
  if (!row) return null

  // A chat whose bots were all deleted has nobody to show
  const { members, ...chat } = row
  return members.length > 0
    ? { ...chat, bots: members.map((member) => member.bot) }
    : null
}

export async function getSidebarConversationOrder(userId: string) {
  const [preferences] = await db
    .select({ order: sidebarPreferences.conversationOrder })
    .from(sidebarPreferences)
    .where(eq(sidebarPreferences.userId, userId))
  return preferences?.order ?? []
}

export async function reorderSidebarConversations(
  userId: string,
  chatIds: string[]
) {
  const ids = sidebarOrderSchema.parse(chatIds)
  const owned = await db
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.userId, userId), inArray(chats.id, ids)))
  if (owned.length !== ids.length)
    throw new Error("Conversations changed. Try again.")
  await db
    .insert(sidebarPreferences)
    .values({ userId, conversationOrder: ids })
    .onConflictDoUpdate({
      target: sidebarPreferences.userId,
      set: { conversationOrder: ids },
    })
}

// chatId comes from the client; only the chat's owner may touch its session
async function ownedChat(userId: string, chatId: string) {
  const chat = await findChat(userId, chatId)
  if (!chat) throw new Error("Chat not found")
  return chat
}

// Billable actions are for plans that include the feature
function assertFeature(caller: Caller, feature: Feature) {
  if (!caller.has({ feature })) {
    Sentry.logger.warn("Paid feature blocked: upgrade required", {
      "billing.feature": feature,
      "user.id": caller.userId,
    })
    throw new Error("Upgrade required")
  }
}

export async function startChatSession(
  caller: Caller,
  params: ChatStartSessionParams<typeof chatAgent>,
  // Read only for the setup greeting, so most starts skip the user lookup
  firstName?: () => Promise<string | null | undefined>
) {
  assertFeature(caller, "bots")
  const owned = await ownedChat(caller.userId, params.chatId)
  for (const bot of owned.bots) await assertBotAccess(owned.userId, bot.id)
  if (
    owned.kind === "direct" &&
    (!owned.bots[0].setupComplete || !owned.lastMessagePreview)
  ) {
    const session = await startBotSetupSession(
      owned.id,
      owned.bots[0],
      await firstName?.()
    )
    return { publicAccessToken: session.publicAccessToken }
  }

  // The client may choose an addressee, never task config or session metadata.
  const session = await startSession({
    chatId: params.chatId,
    clientData: params.clientData,
  })

  Sentry.logger.info("Chat session started", { "chat.id": params.chatId })

  return session
}

export async function mintChatAccessToken(caller: Caller, chatId: string) {
  // Sending needs a token, so a session started on a paid plan ends with it
  assertFeature(caller, "bots")
  const owned = await ownedChat(caller.userId, chatId)
  for (const bot of owned.bots) await assertBotAccess(owned.userId, bot.id)

  return auth.createPublicToken({
    scopes: { read: { sessions: chatId }, write: { sessions: chatId } },
    expirationTime: "1h",
  })
}

// What the chat's agent run is doing, for a client waiting on a reply that
// hasn't started streaming. Session tokens can't read run status, so the
// server reads it for the chat's owner: "queued" means no worker has picked
// the turn up yet, "pending_version" that it waits for a deployment.
export async function getChatTurnStatus(userId: string, chatId: string) {
  await ownedChat(userId, chatId)

  let runId: string | null | undefined
  try {
    runId = (await sessions.retrieve(chatId)).currentRunId
  } catch (error) {
    // No session yet: the first message will start one
    if (error instanceof TriggerApiError && error.status === 404)
      return { state: chatTurnState(undefined) }
    throw error
  }
  if (!runId) return { state: chatTurnState(undefined) }

  const run = await runs.retrieve(runId)
  return { state: chatTurnState(run.status), runId }
}

export async function loadTranscript(userId: string, chatId: string) {
  await ownedChat(userId, chatId)

  const transcript = await loadStoredTranscript({ chatId })

  // Stored untyped, but only this agent ever writes it
  return { ...transcript, messages: transcript.messages as ChatUIMessage[] }
}

export async function getDesktopUrl(caller: Caller, chatId: string) {
  assertFeature(caller, "sandboxes")

  const chat = await findChat(caller.userId, chatId)
  // Only a direct chat has one desktop to show
  if (!chat || chat.kind !== "direct") throw new Error("Chat not found")

  // Showing the desktop starts the sandbox
  const usage = await getUsage(chat.userId)
  if (!usage || usage.remaining.sandbox <= 0) {
    Sentry.logger.warn("Desktop blocked: usage limit reached", {
      "user.id": chat.userId,
      "chat.id": chatId,
      "usage.kind": "sandbox",
    })
    throw new Error("Usage limit reached")
  }

  // The gateway authenticates again and keeps provider tokens server-side.
  try {
    await getBotSandboxInfo(
      await ensureBotComputer(chat.bots[0].id, chat.userId)
    )
  } catch (error) {
    if (error instanceof SandboxMissingError) return { missing: true as const }
    throw error
  }
  return {
    missing: false as const,
    url: `/api/chats/${encodeURIComponent(chatId)}/desktop`,
  }
}

export async function resetDesktop(caller: Caller, chatId: string) {
  assertFeature(caller, "sandboxes")
  const chat = await findChat(caller.userId, chatId)
  if (!chat || chat.kind !== "direct") throw new Error("Chat not found")
  const usage = await getUsage(caller.userId)
  if (!usage || usage.remaining.sandbox <= 0)
    throw new Error("Usage limit reached")
  const bot = chat.bots[0]
  if (!bot.sandboxId) {
    await ensureBotComputer(bot.id, caller.userId)
    return
  }
  await resetBotSandbox(bot.id, caller.userId, bot.sandboxId)
}

export async function pauseDesktop(userId: string, chatId: string) {
  const chat = await findChat(userId, chatId)
  if (!chat || chat.kind !== "direct") throw new Error("Chat not found")
  if (chat.bots[0].sandboxId) await pauseBotSandbox(chat.bots[0].sandboxId)
}

// A client retry with the same requestId returns the chat already made
export async function createGroupChat(
  userId: string,
  values: GroupChatInsert,
  requestId?: string
) {
  const chat = await provisionGroup(
    userId,
    values,
    requestId === undefined
      ? undefined
      : `chat_${teamOperationId(userId, "group-chat", requestId)}`
  )

  Sentry.logger.info("Group chat created", {
    "user.id": userId,
    "chat.id": chat.id,
    "chat.bot_count": values.botIds.length,
  })

  return chat
}

export async function updateGroupChat(
  userId: string,
  chatId: string,
  values: GroupChatInsert
) {
  const data = groupChatInsertSchema.parse(values)
  const botIds = [...new Set(data.botIds)]

  // The IDs come from the client; every one must be a bot of this user
  const owned = await db
    .select({ id: bots.id })
    .from(bots)
    .where(and(eq(bots.userId, userId), inArray(bots.id, botIds)))
  if (botIds.length < 2 || owned.length !== botIds.length) {
    throw new Error("Bot not found")
  }

  const chat = await db.transaction(async (tx) => {
    const [chat] = await tx
      .update(chats)
      .set({ name: data.name })
      .where(
        and(
          eq(chats.id, chatId),
          eq(chats.userId, userId),
          eq(chats.kind, "group")
        )
      )
      .returning()
    if (!chat) throw new Error("Chat not found")

    await tx
      .delete(chatMembers)
      .where(
        and(
          eq(chatMembers.chatId, chatId),
          notInArray(chatMembers.botId, botIds)
        )
      )

    // Bots that stay keep the row they joined with, and so their place
    await tx
      .insert(chatMembers)
      .values(botIds.map((botId) => ({ chatId, botId })))
      .onConflictDoNothing()

    return chat
  })

  Sentry.logger.info("Group chat updated", {
    "user.id": userId,
    "chat.id": chat.id,
    "chat.bot_count": botIds.length,
  })

  return chat
}

export async function deleteGroupChat(userId: string, chatId: string) {
  // Memberships go with the chat; the bots stay
  const [chat] = await db
    .delete(chats)
    .where(
      and(
        eq(chats.id, chatId),
        eq(chats.userId, userId),
        eq(chats.kind, "group")
      )
    )
    .returning({ id: chats.id })
  if (!chat) throw new Error("Chat not found")

  Sentry.logger.info("Group chat deleted", {
    "user.id": userId,
    "chat.id": chat.id,
  })
}
