import * as Sentry from "@sentry/node"
import { chat } from "@trigger.dev/sdk/ai"
import { isStepCount } from "ai"
import { asc, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { chatMembers, chats, type Bot, type Chat } from "@/db/schema"
import { USAGE_LIMIT_ERROR } from "@/lib/billing"
import { MEMORY_FILE } from "@/lib/e2b"
import { createHandoffTool, type Handoff } from "@/lib/handoff-tool"
import { chatModel, chatModelCost } from "@/lib/model"
import { createSandboxTools, type ChatUIMessage } from "@/lib/sandbox-tools"
import { getUsage, recordUsage, type Usage } from "@/lib/usage"
import { createDelegationTools } from "@/lib/team-delegation"
import { createConnectorTools } from "@/lib/composio"
import { connectedAppInstructions } from "@/lib/agent-tool-instructions"
import { botPersonalityInstructions } from "@/lib/bot-personality"
import {
  createBotSetupTools,
  buildBotSetupInstructions,
  botSetupMessageId,
} from "@/lib/bot-setup-tools"
import { configureBotProfile } from "@/lib/bot-profile"
import { chatPreview } from "@/lib/chat-preview"
import { ensureBotComputer } from "@/lib/bot-computer"
import { assertBotAccess } from "@/lib/teammates"
import { withSandboxLock } from "@/lib/sandbox-lock"
import { createTavilyClient, tavilyCost } from "@/lib/tavily"
import { createWebTools } from "@/lib/web-tools"
import { webSearchInstructions } from "@/lib/web-search-instructions"

// Sent with each message. Missing in direct chats, and when the session starts.
const clientDataSchema = z
  .object({
    // The bot a group chat's message is addressed to
    botId: z.string().optional(),
  })
  .optional()

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

// What a bot is told on top of its own job when it answers in a group chat
function buildGroupInstructions(bot: Bot, chat: Chat, bots: Bot[]) {
  const teammates = bots
    .filter((teammate) => teammate.id !== bot.id)
    .map(
      (teammate) => `- ${teammate.name} (id: ${teammate.id}): ${teammate.job}`
    )
    .join("\n")

  return [
    `You are in a group chat${chat.name ? ` called "${chat.name}"` : ""}, together with the person and these other teammates. Each of them has a job and a sandbox of their own:\n\n${teammates}`,
    "The person addresses each message to one teammate, and this one is yours: either they picked you, or a teammate handed it to you. Earlier replies in this conversation may have been written by other teammates rather than by you. Use them as context, and do not present their work as your own.",
    "Use handoff when a request belongs to another member of this group. They take over in this chat. Never pass back to a teammate who already held this request. When no member fits, use the team creation and delegation tools described below.",
  ]
}

// How a bot carries what it learns from one chat to the others it is in
const memoryInstructions = [
  "You talk to the person in more than one conversation: a private one-to-one chat, and any group chats they add you to. Each conversation only shows you its own messages, so nothing said in one is visible to you in another. Your memory is what carries across: notes you save with the remember tool and read back with the recall tool, the same notes in every conversation.",
  "Call recall before you answer anything that could depend on another conversation: a question about the person, their preferences, their projects, earlier decisions or earlier work, or a reference to something you cannot find in this conversation. Never say you do not know something about the person, and never ask them to tell you, until you have called recall in this turn. Skip it only for requests that plainly stand on their own.",
  `Call remember in the same turn you learn something that would be useful in a later conversation, and every time the person asks you to remember something. Telling them you will remember is not enough: unless you call remember, it is gone as soon as this conversation is. Leave out small talk and details that only matter to the request in front of you. The notes live in ${MEMORY_FILE} in your sandbox's home directory, which you can edit with the file tools when a note has gone out of date.`,
]

// `group` is the chat and all its bots, when the bot is answering in a group chat
function buildInstructions(
  bot: Bot,
  group: { chat: Chat; bots: Bot[] } | undefined,
  appToolsAvailable: boolean,
  computerAvailable = true,
  webToolsAvailable = false
) {
  if (!bot.setupComplete && !group)
    return buildBotSetupInstructions(bot.job, bot.instructions, bot.name)
  return [
    `You are ${bot.name}, an AI teammate. Your job: ${bot.job}`,
    "You work alongside the person you are talking to as a member of their team. They gave you your name and your job, and they come to you for that job. Stay in that role, and when asked who you are, answer as yourself.",
    bot.instructions &&
      `They also told you how to go about your job:\n\n${bot.instructions}`,
    botPersonalityInstructions,
    `Current date (UTC): ${new Date().toISOString().slice(0, 10)}.`,
    webSearchInstructions(webToolsAvailable),
    ...(computerAvailable
      ? [
          "You have a sandbox of your own: an isolated Linux machine in the cloud with its own filesystem, network, CPU, memory and disk. It belongs to you alone, is not shared with other teammates, and stays yours for as long as you exist. Files you leave there are still there next time.",
          "Your sandbox tools let you run shell commands and read, write and list files on your computer. It also has a graphical desktop, 1024x768 pixels, that you operate with the mouse and keyboard tools. Use these tools for local files, coding, and desktop tasks.",
          "On the desktop you work blind until you look: call viewScreen to see it before you click or type, and again afterwards to check what happened. viewScreen is for your own eyes. Call showScreen instead only when the person asks to see the screen or asks what is on it, because that one puts the screenshot in the chat.",
          ...memoryInstructions,
        ]
      : [
          "The person is on the free plan: one bot, one connected app, and a one-time $1 AI allowance. You can chat, use built-in web tools when configured, and use their connected app tools. Cloud computers, shell, files, screenshots, persistent memory, and additional teammates require a paid plan. Do not claim to have those capabilities or try to work around these limits. You can use the current conversation as context.",
        ]),
    ...(group ? buildGroupInstructions(bot, group.chat, group.bots) : []),
    ...(computerAvailable
      ? [
          "You can build the person's team. When a task clearly falls outside your job, call listTeammates first. Reuse a suitable existing teammate with delegateToTeammate; if none fits, createTeammate with a focused name, role and instructions. Before creating, tell the person you are creating a bot for that use case. Include the original task, relevant context, constraints and expected output in the prompt: the destination cannot see this chat. A successful tool starts the new chat and automatically takes the person there. Do not call more tools or continue answering after a successful destination tool. Do not delegate merely because a request is difficult. If creation fails, explain the failure and do not claim you created a bot.",
          "When the person wants several specialists to collaborate, listTeammates and createGroupChat using two to eight teammates and a complete shared brief. Reuse existing bots and create missing specialists within the group tool. The first member starts, and can hand off within the group. Creating teammates provisions real computers and is subject to the person's plan and usage allowance.",
        ]
      : []),
    connectedAppInstructions(appToolsAvailable, computerAvailable),
    "Follow explicit preferences the person has given for your voice and working style. The shared conversational guidance supplies defaults, not a reason to ignore their requested detail, format, or tone. Use askUser only for a necessary clarification or confirmation, when a concise set of choices helps. Wait for their answer. In a private chat, use configureBot to change your own name, job or instructions only after the person confirms the proposed changes; an explicit request to apply a complete configuration is confirmation.",
  ]
    .filter(Boolean)
    .join("\n\n")
}

const turnModelUsage = chat.local<{
  cost: number
  webCost: number
  messageId: string
  usageKey: string
}>({
  id: "chat-turn-model-cost",
})

// The transcript is kept per chatId by the agent's default transcript storage
export const chatAgent = chat
  .withUIMessage<ChatUIMessage>()
  .withClientData({ schema: clientDataSchema })
  .agent({
    id: "chat",
    onBoot: () => {
      turnModelUsage.init({ cost: 0, webCost: 0, messageId: "", usageKey: "" })
    },
    onTurnStart: ({ uiMessages, runId, turn }) => {
      turnModelUsage.usageKey = `ai:${runId}:${turn}`
      turnModelUsage.cost = 0
      turnModelUsage.webCost = 0
      const latest = uiMessages.findLast((message) => message.role === "user")
      if (!latest) throw new Error("No task to delegate")
      turnModelUsage.messageId = latest.id
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
      const sandboxTools = createSandboxTools(async () => {
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
      })

      const teamTools = createDelegationTools({
        userId,
        chatId,
        sourceName: bot.name,
        messageId: () => turnModelUsage.messageId,
      })
      const connectorTools = process.env.COMPOSIO_API_KEY
        ? createConnectorTools(userId)
        : {}
      const webTools = process.env.TAVILY_API_KEY?.trim()
        ? createWebTools(
            createTavilyClient({
              beforeRequest: async (maxCredits) => {
                const usage = await getUsage(userId)
                if (
                  usage.remaining.ai - turnModelUsage.cost <
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
      const setupTools = createBotSetupTools((profile) =>
        configureBotProfile(userId, current.id, profile)
      )
      const sharedTools = {
        ...sandboxTools,
        ...teamTools,
        ...connectorTools,
        ...webTools,
        ...setupTools,
      }
      if (!bot.setupComplete && kind === "direct") return setupTools
      if (plan.tier === "free")
        return { ...connectorTools, ...webTools, ...setupTools }
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
          return { botId: target.id, name: target.name }
        }),
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

      if (usage && row) {
        await recordUsage([
          {
            userId: row.userId,
            kind: "ai",
            amount: turnModelUsage.cost,
            idempotencyKey: `ai:${runId}:${turn}`,
          },
        ])
      }

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
        ...(row && { "user.id": row.userId }),
        ...(usage && {
          "gen_ai.usage.input_tokens": usage.inputTokens ?? 0,
          "gen_ai.usage.output_tokens": usage.outputTokens ?? 0,
          // Millionths of a dollar, as in the usage ledger
          "usage.cost": turnModelUsage.cost,
          "usage.web_cost": turnModelUsage.webCost,
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

      // Every turn, as a session outlives the plan it was started on
      const usage = await getUsage(row.userId)
      await assertBotAccess(row.userId, bot.id)
      if (usage.tier === "free" && group)
        throw new Error("Group chats require a paid plan.")
      if (!usage || usage.remaining.ai <= 0) throw new Error(USAGE_LIMIT_ERROR)

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
          model: chatModel(messages),
          // The managed streamText takes the prompt as `system` on every AI SDK version
          system: buildInstructions(
            bot,
            group,
            appToolsAvailable,
            usage.tier === "paid",
            webToolsAvailable
          ),
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
              model: chatModel(messages),
              ...(updated && {
                instructions: buildInstructions(
                  updated,
                  group,
                  appToolsAvailable,
                  usage.tier === "paid",
                  webToolsAvailable
                ),
              }),
            }
          },
          onStepEnd: ({ usage, model }) => {
            turnModelUsage.cost += chatModelCost(usage, model.modelId)
          },
          stopWhen: [
            ({ steps }) =>
              steps.some((step) =>
                step.toolResults.some((result) => result.toolName === "askUser")
              ),
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
            // A long turn ends once it has spent what was left
            ({ steps }) =>
              steps.reduce(
                (cost, step) =>
                  cost + chatModelCost(step.usage, step.model.modelId),
                0
              ) +
                turnModelUsage.webCost >=
              usage.remaining.ai,
          ],
          abortSignal: signal,
        })
      }
      if (usage.tier === "paid") return respond(usage)
      // One free account cannot spend the same remaining starter credit from
      // parallel conversations. Persist cost before releasing the account lock.
      return withSandboxLock(`free-ai:${row.userId}`, async () => {
        signal.throwIfAborted()
        const currentUsage = await getUsage(row.userId)
        if (currentUsage.remaining.ai <= 0) throw new Error(USAGE_LIMIT_ERROR)
        try {
          const result = respond(currentUsage)
          // Raw chat.pipe streams without saving text/tools or a shared message
          // ID. Capture the full reply so continuation runs retain the answer
          // and the browser resumes the same message rather than duplicating it.
          const outcome = await chat.pipeAndCapture(result, {
            signal,
            originalMessages: chat.history.all(),
          })
          if (outcome.status === "error") throw outcome.error
          // The managed agent skips auto-piping an already captured stream, but
          // still reads this result's usage for its completion hook.
          return result
        } finally {
          if (turnModelUsage.cost > 0)
            await recordUsage([
              {
                userId: row.userId,
                kind: "ai",
                amount: turnModelUsage.cost,
                idempotencyKey: turnModelUsage.usageKey,
              },
            ])
        }
      })
    },
  })
