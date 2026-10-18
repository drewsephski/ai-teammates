import { sessions } from "@trigger.dev/sdk"
import { and, eq, inArray } from "drizzle-orm"
import { createBotAvatar } from "@/lib/bot-avatar"

import { db } from "@/db"
import { bots, chatMembers, chats } from "@/db/schema"
import { withSandboxLock } from "@/lib/sandbox-lock"
import { assertDelegationDepth, teamOperationId } from "@/lib/team-policy"
import { createTeamTools, type TeamDestination } from "@/lib/team-tools"
import { rootMessageId } from "@/lib/turn-continuation"
import {
  assertTeamAccess,
  provisionGroup,
  provisionTeammate,
} from "@/lib/teammates"

export function createDelegationTools(context: {
  userId: string
  chatId: string
  messageId: () => string
  sourceName: string
}) {
  // Serialize all destination tools for this turn, including parallel model calls.
  async function delegate(
    create: (
      destinationId: string,
      operationId: string
    ) => Promise<TeamDestination>,
    prompt: string,
    computer = false
  ) {
    const operationId = teamOperationId(
      context.userId,
      context.chatId,
      context.messageId()
    )
    const destinationId = `chat_${operationId}`
    return withSandboxLock(`delegation:${operationId}`, async () => {
      await assertTeamAccess(context.userId, computer)
      const source = await sessions.retrieve(context.chatId)
      // A continued brief keeps the depth of the brief that started it
      const depth =
        source.metadata?.delegationMessageId ===
          rootMessageId(context.messageId()) &&
        typeof source.metadata?.delegationDepth === "number"
          ? source.metadata.delegationDepth
          : 0
      assertDelegationDepth(depth)
      const existing = await db.query.chats.findFirst({
        where: and(
          eq(chats.id, destinationId),
          eq(chats.userId, context.userId)
        ),
        with: { members: { with: { bot: true } } },
      })
      const destination = existing
        ? {
            chatId: existing.id,
            name: existing.name ?? existing.members[0]?.bot.name ?? "Teammate",
            kind: existing.kind,
          }
        : await create(destinationId, operationId)
      // Creation AND first message are atomic in Trigger.dev. Repeating this call
      // returns the existing session without sending a duplicate task.
      await sessions.start({
        type: "chat.agent",
        externalId: destination.chatId,
        taskIdentifier: "chat",
        metadata: {
          delegationDepth: depth + 1,
          delegationMessageId: `brief_${operationId}`,
          sourceChatId: context.chatId,
        },
        triggerConfig: {
          tags: [`chat:${destination.chatId}`],
          basePayload: {
            chatId: destination.chatId,
            trigger: "submit-message",
            message: {
              id: `brief_${operationId}`,
              role: "user",
              parts: [
                {
                  type: "text",
                  text: `Task handed over by ${context.sourceName}:\n\n${prompt}`,
                },
              ],
            },
          },
        },
      })
      return destination
    })
  }
  return createTeamTools({
    list: () =>
      db
        .select({ id: bots.id, name: bots.name, job: bots.job })
        .from(bots)
        .where(eq(bots.userId, context.userId)),
    create: ({ prompt, ...values }) =>
      delegate(
        async (destinationId, operationId) => {
          const { bot, chatId } = await provisionTeammate(
            context.userId,
            { ...values, avatar: createBotAvatar() },
            { botId: `bot_${operationId}`, chatId: destinationId }
          )
          return { chatId, name: bot.name, kind: "direct" }
        },
        prompt,
        true
      ),
    group: ({ prompt, specialists, botIds, name }) =>
      delegate(
        async (destinationId, operationId) => {
          const existingIds = [...new Set(botIds)]
          if (existingIds.length) {
            const owned = await db
              .select({ id: bots.id })
              .from(bots)
              .where(
                and(
                  eq(bots.userId, context.userId),
                  inArray(bots.id, existingIds)
                )
              )
            if (owned.length !== existingIds.length)
              throw new Error("Bot not found")
          }
          const memberIds = [...existingIds]
          for (const [index, specialist] of specialists.entries()) {
            const { bot } = await provisionTeammate(
              context.userId,
              { ...specialist, avatar: createBotAvatar() },
              {
                botId: `bot_${operationId}_${index}`,
                chatId: `direct_${operationId}_${index}`,
              }
            )
            memberIds.push(bot.id)
          }
          const group = await provisionGroup(
            context.userId,
            { name, botIds: memberIds },
            destinationId
          )
          return { chatId: group.id, name: group.name!, kind: "group" }
        },
        prompt,
        specialists.length > 0
      ),
    delegate: ({ botId, prompt }) =>
      delegate(async (destinationId) => {
        if (
          await db.query.chatMembers.findFirst({
            where: and(
              eq(chatMembers.chatId, context.chatId),
              eq(chatMembers.botId, botId)
            ),
          })
        )
          throw new Error(
            "This bot is already in the chat. Answer here or use the group handoff."
          )
        return db.transaction(async (tx) => {
          const bot = await tx.query.bots.findFirst({
            where: and(eq(bots.id, botId), eq(bots.userId, context.userId)),
          })
          if (!bot) throw new Error("Bot not found")
          await tx.insert(chats).values({
            id: destinationId,
            userId: context.userId,
            kind: "direct",
          })
          await tx.insert(chatMembers).values({ chatId: destinationId, botId })
          return {
            chatId: destinationId,
            name: bot.name,
            kind: "direct" as const,
          }
        })
      }, prompt),
  })
}
