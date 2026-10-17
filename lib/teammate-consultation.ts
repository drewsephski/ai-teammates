import { chat, defaultStorage } from "@trigger.dev/sdk/ai"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/db"
import { bots, chatMembers, chats } from "@/db/schema"
import { createConsultationTool } from "@/lib/consultation-tool"
import { generateConsultation } from "@/lib/generate-consultation"
import { followUpContext } from "@/lib/chat-follow-ups"
import type { ChatUIMessage } from "@/lib/sandbox-tools"
import { isMemoryOn, loadMemoryContext } from "@/lib/memory"
import { createMemoryTools } from "@/lib/memory-tools"
import { assertBotAccess, assertTeamAccess } from "@/lib/teammates"
import { getUsage, recordUsage } from "@/lib/usage"
import { chatModel, chatModelCost } from "@/lib/model"
import { replyModelForUser } from "@/lib/ai-provider"
import { appModelCost } from "@/lib/chatgpt-policy"
import { USAGE_LIMIT_ERROR } from "@/lib/billing"

const loadTranscript = chat.createLoadTranscriptAction(defaultStorage, {
  limit: 12,
})

export function createTeammateConsultation(context: {
  userId: string
  chatId: string
  sourceBotId: string
  usageKey: () => string
  unrecordedCost: () => number
  onCost: (cost: number) => void
}) {
  const consulted = new Set<string>()
  return createConsultationTool(
    async ({ botId, prompt }, { toolCallId, abortSignal }) => {
      const signal = AbortSignal.any([
        ...(abortSignal ? [abortSignal] : []),
        AbortSignal.timeout(60_000),
      ])
      signal.throwIfAborted()
      if (botId === context.sourceBotId)
        throw new Error("This is your own bot. Answer directly instead.")
      if (consulted.has(botId) || consulted.size >= 5)
        throw new Error("Consult each teammate once, up to five per turn.")
      consulted.add(botId)
      // The model and browser both supply IDs; scope every lookup to the owner.
      const bot = await db.query.bots.findFirst({
        where: and(eq(bots.id, botId), eq(bots.userId, context.userId)),
      })
      if (!bot) throw new Error("Teammate not found")
      await assertTeamAccess(context.userId)
      await assertBotAccess(context.userId, bot.id)
      // The person's ChatGPT plan or own key pays, when they chose one
      const reply = await replyModelForUser(context.userId)
      const ownModel = reply.kind !== "krafty"
      const usage = await getUsage(context.userId)
      if (!ownModel && usage.remaining.ai - context.unrecordedCost() < 10_000)
        throw new Error(USAGE_LIMIT_ERROR)
      const [directChat] = await db
        .select({ id: chats.id })
        .from(chats)
        .innerJoin(chatMembers, eq(chatMembers.chatId, chats.id))
        .where(
          and(
            eq(chats.userId, context.userId),
            eq(chats.kind, "direct"),
            eq(chatMembers.botId, bot.id)
          )
        )
        .orderBy(desc(chats.lastMessageAt), desc(chats.createdAt))
        .limit(1)
      const transcript =
        directChat && directChat.id !== context.chatId
          ? await loadTranscript({ chatId: directChat.id })
          : undefined
      // The person's shared memory, as the consulted bot would see it in its
      // own chat. Sensitive memories never leave the conversation they came from.
      const memoryOn = await isMemoryOn(context.userId, context.chatId)
      const memory = memoryOn
        ? await loadMemoryContext({
            userId: context.userId,
            botId: bot.id,
            query: prompt,
            includeSensitive: false,
          }).catch(() => undefined)
        : undefined
      let step = 0
      const answer = await generateConsultation({
        model: reply.kind === "krafty" ? chatModel() : reply.model,
        bot,
        prompt,
        recentConversation: followUpContext(
          (transcript?.messages ?? []) as ChatUIMessage[]
        ),
        memory: memory?.block,
        tools: memoryOn
          ? {
              recall: createMemoryTools({
                userId: context.userId,
                chatId: context.chatId,
                getBotId: () => bot.id,
                free: false,
                includeSensitive: false,
              }).recall,
            }
          : {},
        signal,
        beforeStep: async () => {
          const current = await getUsage(context.userId)
          if (
            !ownModel &&
            current.remaining.ai - context.unrecordedCost() < 2000
          )
            throw new Error(USAGE_LIMIT_ERROR)
        },
        onUsage: async (usage, modelId) => {
          const amount = appModelCost(ownModel, () =>
            chatModelCost(usage, modelId)
          )
          if (amount > 0)
            await recordUsage([
              {
                userId: context.userId,
                kind: "ai",
                amount,
                idempotencyKey: `${context.usageKey()}:consult:${toolCallId}:${step}`,
              },
            ])
          context.onCost(amount)
          step++
        },
      })
      return { botId: bot.id, name: bot.name, answer }
    }
  )
}
