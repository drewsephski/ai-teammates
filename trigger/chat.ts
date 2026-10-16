import * as Sentry from "@sentry/node"
import { metadata, sessions } from "@trigger.dev/sdk"
import { chat } from "@trigger.dev/sdk/ai"
import { isStepCount } from "ai"
import { and, asc, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { bots as botTable, chatMembers, chats } from "@/db/schema"
import { USAGE_LIMIT_ERROR } from "@/lib/billing"
import { isModelUnavailable, MODEL_UNAVAILABLE_ERROR } from "@/lib/chat-turn"
import { createHandoffTool, type Handoff } from "@/lib/handoff-tool"
import { chatModel, chatModelCost } from "@/lib/model"
import { createSandboxTools, type ChatUIMessage } from "@/lib/sandbox-tools"
import { isMemoryOn, loadMemoryContext, touchMemories } from "@/lib/memory"
import { createMemoryTools } from "@/lib/memory-tools"
import { getUsage, holdUsage, recordUsage, type Usage } from "@/lib/usage"
import { createTeammateConsultation } from "@/lib/teammate-consultation"
import {
  composerInstructions,
  chatClientDataSchema,
  validateMentionRanges,
  resolveMentionedBots,
  type BotMention,
} from "@/lib/composer"
import { createDelegationTools } from "@/lib/team-delegation"
import { createApprovalGate, createConnectorTools } from "@/lib/composio"
import { createRoutineTools } from "@/lib/routine-tools"
import {
  createRoutine,
  deleteRoutine,
  listRoutines,
  updateRoutine,
  userTimeZone,
} from "@/lib/routines"
import { unattendedOrigin } from "@/lib/routine-policy"
import { recordActivity } from "@/lib/notify"
import { createBotSetupTools, botSetupMessageId } from "@/lib/bot-setup-tools"
import { configureBotProfile } from "@/lib/bot-profile"
import { buildChatInstructions } from "@/lib/chat-instructions"
import { assertComputerLoginReady } from "@/lib/computer-login-policy"
import { chatPreview } from "@/lib/chat-preview"
import { ensureBotComputer } from "@/lib/bot-computer"
import { assertBotAccess } from "@/lib/teammates"
import { createTavilyClient, tavilyCost } from "@/lib/tavily"
import { createWebTools } from "@/lib/web-tools"
import { isChatGPTSelected } from "@/lib/chatgpt-connection"
import { chatGPTModelForUser } from "@/lib/chatgpt-model"
import { canSuggestFollowUps } from "@/lib/chat-follow-ups"
import { generateChatFollowUps } from "@/lib/generate-chat-follow-ups"
import {
  appModelCost,
  canUseAI,
  CHATGPT_LIMIT_ERROR,
  CHATGPT_RECONNECT_ERROR,
  CHATGPT_REQUEST_ERROR,
} from "@/lib/chatgpt-policy"

// A chat's bots and the one answering this turn. No session here: the chat's
// owner was checked when the session started. botId comes from the browser, so
// it only ever picks among the chat's own members; without one the first answers.
async function getChatBots(chatId: string, botId?: string) {
  const row = await db.query.chats.findFirst({
    where: eq(chats.id, chatId),
    with: {
      members: {
        orderBy: [asc(chatMembers.joinedAt), asc(chatMembers.botId)],
        with: { bot: true },
      },
    },
  })

  const bots = row?.members.map((member) => member.bot) ?? []
  const bot = bots.find((bot) => bot.id === botId) ?? bots[0]
  if (!row || !bot) throw new Error("Bot is not in this chat")

  return { chat: row, bots, bot }
}

const turnModelUsage = chat.local<{
  cost: number
  webCost: number
  consultationCost: number
  // Model cost already written to this turn's usage hold
  held: number
  // The account's AI allowance left after every running turn's holds
  remaining: number
  approvalRequested: boolean
  startedAt: number
  messageId: string
  usageKey: string
  chatgpt: boolean
  composerText: string
  mentions: BotMention[]
  followUps?: { signal: AbortSignal }
}>({
  id: "chat-turn-model-cost",
})

// The transcript is kept per chatId by the agent's default transcript storage
export const chatAgent = chat
  .withUIMessage<ChatUIMessage>()
  .withClientData({ schema: chatClientDataSchema })
  .agent({
    id: "chat",
    uiMessageStreamOptions: {
      onError: (error) => {
        if (isModelUnavailable(error)) return MODEL_UNAVAILABLE_ERROR
        const message = error instanceof Error ? error.message : ""
        return [
          USAGE_LIMIT_ERROR,
          CHATGPT_LIMIT_ERROR,
          CHATGPT_RECONNECT_ERROR,
          CHATGPT_REQUEST_ERROR,
        ].includes(message)
          ? message
          : "Couldn’t complete the reply. Please try again."
      },
    },
    onBoot: () => {
      turnModelUsage.init({
        cost: 0,
        webCost: 0,
        consultationCost: 0,
        held: 0,
        remaining: Infinity,
        approvalRequested: false,
        startedAt: Date.now(),
        messageId: "",
        usageKey: "",
        chatgpt: false,
        composerText: "",
        mentions: [],
      })
    },
    onTurnStart: ({ uiMessages, runId, turn }) => {
      turnModelUsage.usageKey = `ai:${runId}:${turn}`
      turnModelUsage.cost = 0
      turnModelUsage.webCost = 0
      turnModelUsage.consultationCost = 0
      turnModelUsage.held = 0
      turnModelUsage.remaining = Infinity
      turnModelUsage.approvalRequested = false
      turnModelUsage.startedAt = Date.now()
      turnModelUsage.chatgpt = false
      turnModelUsage.followUps = undefined
      const latest = uiMessages.findLast((message) => message.role === "user")
      if (!latest) throw new Error("No task to delegate")
      turnModelUsage.messageId = latest.id
      turnModelUsage.composerText = latest.parts
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("\n")
      turnModelUsage.mentions = validateMentionRanges(
        turnModelUsage.composerText,
        latest.metadata?.mentions
      )
    },
    // Declared here so screenshots stay images when earlier turns are replayed
    tools: async ({ chatId, clientData }) => {
      const {
        chat: { kind, userId },
        bots,
        bot,
      } = await getChatBots(chatId, clientData?.botId)

      const plan = await getUsage(userId)

      // Whoever holds the turn; a handoff moves it, and the sandbox tools with it
      let current = bot
      const held = new Set([bot.id])

      // Asked before every tool call, so a yes is kept for a minute
      let checkedAt = 0
      let screenViewed = false
      const getComputerId = async () => {
        if (Date.now() - checkedAt > 60_000) {
          const usage = await getUsage(userId)
          if (!usage || usage.remaining.sandbox <= 0) {
            Sentry.logger.warn("Sandbox tool blocked: usage limit reached", {
              "chat.id": chatId,
              "user.id": userId,
              "bot.id": current.id,
              "usage.kind": "sandbox",
            })
            throw new Error(
              "The sandbox hours for this billing period are used up, so the sandbox can't be used until the period resets."
            )
          }
          checkedAt = Date.now()
        }

        // A reset changes the ID while this durable turn/session may survive.
        return ensureBotComputer(current.id, userId)
      }
      const sandboxTools = createSandboxTools(getComputerId, {
        onScreenViewed: () => {
          screenViewed = true
        },
      })

      const teamTools = createDelegationTools({
        userId,
        chatId,
        sourceName: bot.name,
        messageId: () => turnModelUsage.messageId,
      })
      const consultationTools = createTeammateConsultation({
        userId,
        chatId,
        sourceBotId: bot.id,
        usageKey: () => turnModelUsage.usageKey,
        // getUsage already counts the held part of this turn's cost
        unrecordedCost: () => turnModelUsage.cost - turnModelUsage.held,
        onCost: (cost) => {
          turnModelUsage.consultationCost += cost
        },
      })
      const sourceConfig = (await sessions.retrieve(chatId)).metadata?.forYou
      const source =
        sourceConfig === undefined
          ? undefined
          : z
              .object({
                toolkit: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,99}$/),
                accountId: z.string().min(1).max(200),
              })
              .parse(sourceConfig)
      // External writes wait for the owner (lib/approvals.ts)
      const approvalGate = createApprovalGate({
        userId,
        chatId,
        botId: () => current.id,
      })
      const connectorTools = process.env.COMPOSIO_API_KEY
        ? createConnectorTools(userId, {
            ...(source && {
              accountBindings: { [source.toolkit]: source.accountId },
            }),
            approvals: {
              ...approvalGate,
              request: async (call) => {
                const held = await approvalGate.request(call)
                turnModelUsage.approvalRequested = true
                return held
              },
            },
          })
        : {}
      // Routines report into this chat, as the bot holding the turn
      // Only while the owner is in the conversation: an unattended turn reads
      // untrusted email and web content, which must not be able to schedule
      // recurring work or switch the owner's routines off. A bot changes only
      // its own routines.
      const attended = () => {
        if (unattendedOrigin(turnModelUsage.messageId))
          throw new Error(
            "Routines can only be changed while the owner is in the chat. Mention the change in your report instead."
          )
      }
      const routineTools = createRoutineTools({
        timezone: () => userTimeZone(userId),
        list: () => listRoutines(userId),
        create: ({ requestId, ...input }) => {
          attended()
          return createRoutine(
            userId,
            { ...input, botId: current.id, requestId },
            { chatId }
          )
        },
        update: (routineId, patch) => {
          attended()
          return updateRoutine(userId, routineId, patch, { botId: current.id })
        },
        remove: (routineId) => {
          attended()
          return deleteRoutine(userId, routineId, { botId: current.id })
        },
      })
      const webTools = process.env.TAVILY_API_KEY?.trim()
        ? createWebTools(
            createTavilyClient({
              beforeRequest: async (maxCredits) => {
                const usage = await getUsage(userId)
                if (
                  usage.remaining.ai -
                    (turnModelUsage.cost - turnModelUsage.held) <
                  tavilyCost(maxCredits)
                )
                  throw new Error(USAGE_LIMIT_ERROR)
              },
              onUsage: async (credits, toolCallId) => {
                const cost = tavilyCost(credits)
                if (cost === 0) return
                await recordUsage([
                  {
                    userId,
                    kind: "ai",
                    amount: cost,
                    idempotencyKey: `${turnModelUsage.usageKey}:web:${toolCallId}`,
                  },
                ])
                turnModelUsage.webCost += cost
              },
            })
          )
        : {}
      const setupTools = createBotSetupTools(
        (profile) => configureBotProfile(userId, current.id, profile),
        {
          prepareComputerLogin: async () => {
            assertComputerLoginReady({
              paid: plan.tier === "paid",
              direct: kind === "direct",
              screenViewed,
            })
            await getComputerId()
          },
        }
      )
      // Every plan; none at all when memory is off or the chat is temporary
      const memoryTools = (await isMemoryOn(userId, chatId))
        ? createMemoryTools({
            userId,
            chatId,
            getBotId: () => current.id,
            free: plan.tier === "free",
          })
        : {}
      const sharedTools = {
        ...sandboxTools,
        ...memoryTools,
        ...teamTools,
        ...consultationTools,
        ...connectorTools,
        ...webTools,
        ...setupTools,
        ...routineTools,
      }
      if (plan.tier === "free")
        return {
          ...connectorTools,
          ...webTools,
          ...setupTools,
          ...memoryTools,
          ...routineTools,
        }
      if (kind !== "group") return sharedTools

      return {
        ...sharedTools,
        ...createHandoffTool((botId) => {
          const target = bots.find((bot) => bot.id === botId)
          if (!target) throw new Error("No teammate in this chat has that id.")
          // Keeps a request from bouncing between bots
          if (held.has(target.id)) {
            Sentry.logger.warn("Handoff refused: teammate already had it", {
              "chat.id": chatId,
              "user.id": userId,
              "bot.id": current.id,
              "handoff.bot.id": target.id,
            })
            throw new Error(
              `${target.name} already had this request. Answer it yourself.`
            )
          }

          Sentry.logger.info("Chat turn handed off", {
            "chat.id": chatId,
            "user.id": userId,
            "bot.id": current.id,
            "handoff.bot.id": target.id,
            "handoff.count": held.size,
          })

          current = target
          held.add(target.id)
          metadata.set("botId", target.id)
          return { botId: target.id, name: target.name }
        }),
      }
    },
    onBeforeTurnComplete: async ({
      chatId,
      responseMessage,
      uiMessages,
      stopped,
      error,
      finishReason,
      writer,
    }) => {
      const config = turnModelUsage.followUps
      if (
        !config ||
        stopped ||
        error ||
        finishReason !== "stop" ||
        config.signal.aborted ||
        !canSuggestFollowUps(responseMessage)
      )
        return

      try {
        const handoff = responseMessage?.parts.findLast(
          (part) =>
            part.type === "tool-handoff" && part.state === "output-available"
        )
        const authorId =
          handoff?.type === "tool-handoff" &&
          handoff.state === "output-available"
            ? handoff.output.botId
            : responseMessage?.metadata?.botId
        const { chat: row, bot } = await getChatBots(chatId, authorId)
        const suggest = async () => {
          const currentUsage = await getUsage(row.userId)
          // Leave room for this bounded auxiliary call; never spend a depleted
          // Krafty allowance. Recommendations always use the app's GLM model.
          // getUsage already counts the turn's held cost.
          const unrecordedCost = turnModelUsage.cost - turnModelUsage.held
          if (currentUsage.remaining.ai - unrecordedCost < 10_000) return
          const suggestions = await generateChatFollowUps({
            ...config,
            messages: uiMessages,
            profile: `${bot.name}: ${bot.job}\n${bot.instructions ?? ""}`,
            capabilities: {
              computer:
                currentUsage.tier === "paid" &&
                currentUsage.remaining.sandbox > 0,
              connectedApps: !!process.env.COMPOSIO_API_KEY,
              webSearch: !!process.env.TAVILY_API_KEY?.trim(),
            },
            onUsage: async (usage) => {
              const cost = chatModelCost(usage)
              if (cost > 0)
                await recordUsage([
                  {
                    userId: row.userId,
                    kind: "ai",
                    amount: cost,
                    idempotencyKey: `${turnModelUsage.usageKey}:follow-ups`,
                  },
                ])
            },
          })
          if (!suggestions.length || config.signal.aborted) return
          writer.write({
            type: "data-followUps",
            id: `follow-ups:${responseMessage?.id}`,
            data: { botId: bot.id, suggestions },
          })
        }
        await suggest()
      } catch (error) {
        // Suggestions are optional. Their failure must never fail a completed reply.
        Sentry.logger.warn("Chat follow-up suggestions unavailable", {
          "chat.id": chatId,
          "error.type": error instanceof Error ? error.name : "UnknownError",
        })
      }
    },
    // Fires for stopped and failed turns too, which spent tokens all the same
    onTurnComplete: async ({
      chatId,
      runId,
      turn,
      usage,
      error,
      responseMessage,
    }) => {
      const refused =
        error instanceof Error && error.message === USAGE_LIMIT_ERROR

      // A failed turn leaves the run alive, so the global onFailure never sees it
      if (error && !refused) {
        Sentry.captureException(error, {
          tags: { "trigger.task": "chat", "trigger.run": runId },
          extra: { chatId, turn },
        })
      }

      const [row] = await db
        .select({ userId: chats.userId })
        .from(chats)
        .where(eq(chats.id, chatId))
      const preview = chatPreview(
        responseMessage?.parts
          .flatMap((part) =>
            part.type === "text"
              ? [part.text]
              : part.type === "tool-askUser" &&
                  part.state === "output-available"
                ? [part.output.question]
                : []
          )
          .join(" ") ?? ""
      ).slice(0, 160)
      if (row && preview)
        await db
          .update(chats)
          .set({ lastMessageAt: new Date(), lastMessagePreview: preview })
          .where(eq(chats.id, chatId))

      if (usage && row && turnModelUsage.cost > 0) {
        await recordUsage([
          {
            userId: row.userId,
            kind: "ai",
            amount: turnModelUsage.cost,
            idempotencyKey: `ai:${runId}:${turn}`,
          },
        ])
      }

      if (row)
        await reportUnattendedTurn({
          userId: row.userId,
          chatId,
          runId,
          turn,
          failed: !!error && !refused,
          refused,
          responseMessage,
        }).catch((reportError: unknown) =>
          Sentry.captureException(reportError, { extra: { chatId, turn } })
        )

      // One line per turn: who spent what, and how it ended
      Sentry.logger[error ? "warn" : "info"]("Chat turn finished", {
        "chat.id": chatId,
        "chat.turn": turn,
        "chat.outcome": refused
          ? "usage_limit"
          : error
            ? "failed"
            : "completed",
        "trigger.task": "chat",
        "trigger.run": runId,
        "usage.ai_provider": turnModelUsage.chatgpt ? "chatgpt" : "krafty",
        ...(row && { "user.id": row.userId }),
        ...(usage && {
          "gen_ai.usage.input_tokens": usage.inputTokens ?? 0,
          "gen_ai.usage.output_tokens": usage.outputTokens ?? 0,
          // Millionths of a dollar, as in the usage ledger
          "usage.cost": turnModelUsage.cost,
          "usage.web_cost": turnModelUsage.webCost,
          "usage.consultation_cost": turnModelUsage.consultationCost,
        }),
      })

      // The run sleeps between turns, and may be frozen as soon as this returns
      await Sentry.flush(2000)
    },
    run: async ({
      chatId,
      clientData,
      messages,
      tools,
      signal,
      streamText,
    }) => {
      // Read every turn, so edits to the bots apply to the next message
      const {
        chat: row,
        bots,
        bot,
      } = await getChatBots(chatId, clientData?.botId)
      const group = row.kind === "group" ? { chat: row, bots } : undefined
      metadata.set("botId", bot.id)
      const mentioned = await resolveMentionedBots(
        turnModelUsage.composerText,
        turnModelUsage.mentions,
        (ids) =>
          db
            .select({ id: botTable.id, name: botTable.name, job: botTable.job })
            .from(botTable)
            .where(
              and(eq(botTable.userId, row.userId), inArray(botTable.id, ids))
            )
      )
      const composerContext = composerInstructions(
        turnModelUsage.composerText,
        mentioned,
        bot.id,
        turnModelUsage.mentions
      )

      // Every turn, as a session outlives the plan it was started on
      const usage = await getUsage(row.userId)
      await assertBotAccess(row.userId, bot.id)
      if (usage.tier === "free" && group)
        throw new Error("Group chats require a paid plan.")
      const chatgptSelected = await isChatGPTSelected(row.userId)
      if (!canUseAI(usage.remaining.ai, chatgptSelected))
        throw new Error(USAGE_LIMIT_ERROR)
      turnModelUsage.chatgpt = chatgptSelected
      // Resolve from the authoritative connection, never browser clientData.
      // Every tool step revalidates/refreshes this user's credential.
      const subscriptionModel = chatgptSelected
        ? await chatGPTModelForUser(row.userId)
        : null
      turnModelUsage.followUps = {
        signal,
      }

      // The <memory> block, per answering bot: a handoff brings in that bot's
      // own procedures. Undefined means memory is off for this chat.
      const memoryOn = await isMemoryOn(row.userId, chatId)
      const memoryBlocks = new Map<string, Promise<string>>()
      const memoryFor = (botId: string) => {
        if (!memoryOn) return Promise.resolve(undefined)
        let block = memoryBlocks.get(botId)
        if (!block) {
          block = loadMemoryContext({
            userId: row.userId,
            botId,
            query: turnModelUsage.composerText,
          }).then(
            ({ block, ids }) => {
              chat.defer(touchMemories(ids))
              return block
            },
            (error: unknown) => {
              Sentry.logger.warn("Memory unavailable for this turn", {
                "chat.id": chatId,
                "bot.id": botId,
                "error.type":
                  error instanceof Error ? error.name : "UnknownError",
              })
              return "<memory>Memory could not be loaded for this turn. Call recall if you need it.</memory>"
            }
          )
          memoryBlocks.set(botId, block)
        }
        return block
      }
      const memory = await memoryFor(bot.id)

      function respond(usage: Usage) {
        // Keep the conversation/session, but release this worker after the turn.
        // The next message boots the current deployment instead of waking an
        // older suspended worker with stale tools or environment variables.
        chat.endRun()

        const appToolsAvailable =
          "searchAppTools" in tools && "executeAppTool" in tools
        const webToolsAvailable = "searchWeb" in tools && "readWebPage" in tools

        // Stamped on the reply and kept in the transcript with it
        chat.setUIMessageStreamOptions({
          messageMetadata: () => ({ botId: bot.id }),
        })

        // The agent has loaded this turn and passed ownership/allowance checks.
        // Persist the acknowledgement with its response so refreshes retain it.
        if (turnModelUsage.messageId !== botSetupMessageId(bot.id))
          chat.response.write({
            type: "data-messageSeen",
            id: turnModelUsage.messageId,
            data: {
              messageId: turnModelUsage.messageId,
              seenAt: new Date().toISOString(),
            },
          })

        return streamText({
          model: subscriptionModel ?? chatModel(messages),
          maxRetries: chatgptSelected ? 0 : undefined,
          // The managed streamText takes the prompt as `system` on every AI SDK version
          system: [
            buildChatInstructions(
              bot,
              group,
              appToolsAvailable,
              usage.tier === "paid",
              webToolsAvailable,
              memory
            ),
            composerContext,
          ]
            .filter(Boolean)
            .join("\n\n"),
          messages,
          tools,
          // After a handoff the rest of the turn is the other bot's to answer
          prepareStep: async ({ steps, messages }) => {
            const handoff = steps
              .flatMap((step) => step.toolResults)
              .findLast((result) => result.toolName === "handoff")
            const current =
              handoff &&
              bots.find((bot) => bot.id === (handoff.output as Handoff).botId)
            const configured = steps.some((step) =>
              step.toolResults.some(
                (result) => result.toolName === "configureBot"
              )
            )
            const updated = configured
              ? (await getChatBots(chatId, current?.id ?? clientData?.botId))
                  .bot
              : current

            return {
              model: subscriptionModel ?? chatModel(messages),
              ...(updated && {
                instructions: [
                  buildChatInstructions(
                    updated,
                    group,
                    appToolsAvailable,
                    usage.tier === "paid",
                    webToolsAvailable,
                    await memoryFor(updated.id)
                  ),
                  composerContext,
                ]
                  .filter(Boolean)
                  .join("\n\n"),
              }),
            }
          },
          onStepEnd: async ({ usage, model }) => {
            turnModelUsage.cost += appModelCost(chatgptSelected, () =>
              chatModelCost(usage, model.modelId)
            )
            // Hold what this turn has spent so far, so the account's other
            // turns see it, and stop when the account as a whole runs out
            const cost = turnModelUsage.cost
            if (cost > turnModelUsage.held) {
              await holdUsage(row.userId, turnModelUsage.usageKey, cost)
              turnModelUsage.held = cost
              turnModelUsage.remaining = (
                await getUsage(row.userId)
              ).remaining.ai
            }
          },
          stopWhen: [
            ({ steps }) =>
              steps.some((step) =>
                step.toolResults.some((result) => result.toolName === "askUser")
              ),
            // An external action is waiting for the owner's decision
            () => turnModelUsage.approvalRequested,
            ({ steps }) =>
              steps.some((step) =>
                step.toolResults.some((result) =>
                  [
                    "createTeammate",
                    "createGroupChat",
                    "delegateToTeammate",
                  ].includes(result.toolName)
                )
              ),
            // Desktop work is one small action per step
            isStepCount(50),
            // A long turn ends once it has spent what was left, counting the
            // account's other running turns
            () =>
              !chatgptSelected &&
              (turnModelUsage.remaining <= 0 ||
                turnModelUsage.cost +
                  turnModelUsage.webCost +
                  turnModelUsage.consultationCost >=
                  usage.remaining.ai),
          ],
          abortSignal: signal,
        })
      }
      // Parallel turns on one account see each other through usage holds
      // (onStepEnd), so no account-wide lock is held while the model streams.
      return respond(usage)
    },
  })

// A person who wasn't watching hears about the turn: work a routine, a
// delegation, an approval or a task started, and any turn long enough that
// they've probably walked away. An approval request was already announced.
const LONG_TURN_MS = 2 * 60_000
async function reportUnattendedTurn(turn: {
  userId: string
  chatId: string
  runId: string
  turn: number
  failed: boolean
  refused: boolean
  responseMessage?: ChatUIMessage
}) {
  if (turnModelUsage.approvalRequested) return
  const origin = unattendedOrigin(turnModelUsage.messageId)
  const long = Date.now() - turnModelUsage.startedAt >= LONG_TURN_MS
  if (!origin && !long) return

  const botId = turn.responseMessage?.metadata?.botId
  const [bot] = botId
    ? await db
        .select({ id: botTable.id, name: botTable.name })
        .from(botTable)
        .where(and(eq(botTable.id, botId), eq(botTable.userId, turn.userId)))
    : []
  const name = bot?.name ?? "Your bot"
  const parts = turn.responseMessage?.parts ?? []
  const question = parts.findLast(
    (part) => part.type === "tool-askUser" && part.state === "output-available"
  )
  const text = chatPreview(
    parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join(" ")
  ).slice(0, 200)
  const path = `/chats/${turn.chatId}`
  const dedupeKey = `turn:${turn.runId}:${turn.turn}`

  if (
    question?.type === "tool-askUser" &&
    question.state === "output-available"
  ) {
    await recordActivity(
      {
        userId: turn.userId,
        kind: "question_asked",
        title: `${name} has a question`,
        detail: question.output.question,
        botId: bot?.id,
        chatId: turn.chatId,
        dedupeKey,
      },
      { title: `${name} has a question`, body: question.output.question, path }
    )
    return
  }
  const failed = turn.failed || turn.refused
  const title = failed
    ? `${name} couldn't finish`
    : `${name} finished${origin === "routine" ? " a routine" : ""}`
  const body = turn.refused
    ? "Your AI allowance ran out before the work was done."
    : failed
      ? "Something went wrong. Open the chat to retry."
      : text || "Open the chat to see the result."
  await recordActivity(
    {
      userId: turn.userId,
      kind: failed ? "work_failed" : "work_finished",
      title,
      detail: body,
      botId: bot?.id,
      chatId: turn.chatId,
      dedupeKey,
    },
    { title, body, path }
  )
}
