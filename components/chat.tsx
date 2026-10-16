"use client"

import { useChat } from "@ai-sdk/react"
import * as Sentry from "@sentry/nextjs"
import type { TriggerChatTransport } from "@trigger.dev/sdk/chat"
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react"
import { isToolUIPart } from "ai"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpIcon, SquareIcon, UsersRoundIcon } from "lucide-react"
import { toast } from "@/components/ui/toast"

import {
  loadTranscript,
  mintChatAccessToken,
  startChatSession,
} from "@/actions/chat"

import { ChatComposer } from "@/components/chat-composer"
import type { BotMention, MentionBot } from "@/lib/composer"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { ChatAvatar } from "@/components/chat-avatar"
import { usePublishChatActivity } from "@/components/chat-activity-provider"
import {
  chatActivity,
  chatAuthorSections,
  type ChatActivity,
} from "@/lib/chat-activity"
import { avatarStatusInProgress, avatarStatusLabels } from "@/lib/avatar-state"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  PromptInputProvider,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input"
import { ToolCall } from "@/components/chat-tool-call"
import { ChatQuestion } from "@/components/chat-question"
import { useOptionalDesktopPanel } from "@/components/desktop-panel"
import { ChatFollowUps } from "@/components/chat-follow-ups"
import { ChatMessageActions } from "@/components/chat-message-actions"
import { sectionText } from "@/lib/chat-export"
import { latestFollowUps } from "@/lib/chat-follow-ups"
import { Button } from "@/components/ui/button"
import { botSetupMessageId } from "@/lib/bot-setup-tools"
import { cn } from "@/lib/utils"
import { BotMark } from "@/components/landing/bot/bot-mark"
import { Spiral } from "@/components/ui/spiral"
import { isChatThinking } from "@/lib/chat-thinking"
import { seenMessageIds } from "@/lib/chat-receipts"
import { Badge } from "@/components/ui/badge"
import type { Bot } from "@/db/schema"
import { USAGE_LIMIT_ERROR } from "@/lib/billing"
import { MODEL_UNAVAILABLE_ERROR } from "@/lib/chat-turn"
import {
  CHATGPT_LIMIT_ERROR,
  CHATGPT_RECONNECT_ERROR,
  CHATGPT_REQUEST_ERROR,
} from "@/lib/chatgpt-policy"
import { usePaywall } from "@/hooks/use-paywall"
import { useChatSession } from "@/hooks/use-chat-session"
import { useResumeChatStream } from "@/hooks/use-resume-chat-stream"
import { navigationChatTransport } from "@/lib/chat-transport"
import type { ChatUIMessage } from "@/lib/sandbox-tools"
import type { chatAgent } from "@/trigger/chat"

type ChatBot = Pick<Bot, "id" | "name" | "avatar">

function ChatLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <Spiral
        role="presentation"
        aria-hidden="true"
        className="size-12 text-muted-foreground"
      />
      <p className="text-sm text-muted-foreground">
        Opening your conversation…
      </p>
    </div>
  )
}

// `bots` are a group chat's members to pick from; a direct chat passes none
function Chat({
  chatId,
  name,
  bots,
  setup = false,
  botId,
  directBot,
  mentionBots = [],
  notice,
}: {
  chatId: string
  name: string
  bots?: ChatBot[]
  setup?: boolean
  botId?: string
  directBot?: ChatBot
  mentionBots?: MentionBot[]
  // Shown above the composer, such as a low-allowance warning
  notice?: React.ReactNode
}) {
  const transport = useTriggerChatTransport<typeof chatAgent>({
    task: "chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startChatSession({ chatId, clientData }),
  })
  const [attempt, setAttempt] = useState(0)
  const { messages, isLoading, error } = useChatSession({
    chatId,
    transport,
    loadTranscript,
    attempt,
  })

  if (error)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {"Couldn't load your conversation."}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setAttempt((value) => value + 1)
          }}
        >
          Try again
        </Button>
      </div>
    )

  // useChat only reads its initial messages on mount, so wait for the transcript
  if (isLoading) return <ChatLoading />

  return (
    <ChatMessages
      key={chatId}
      chatId={chatId}
      name={name}
      bots={bots}
      setup={setup}
      botId={botId}
      directBot={directBot}
      mentionBots={mentionBots}
      notice={notice}
      initialMessages={messages}
      transport={transport}
    />
  )
}

function ChatMessages({
  chatId,
  name,
  bots = [],
  initialMessages,
  transport,
  setup,
  botId: directBotId,
  directBot,
  mentionBots = [],
  notice,
}: {
  chatId: string
  name: string
  bots?: ChatBot[]
  initialMessages: ChatUIMessage[]
  transport: TriggerChatTransport
  setup: boolean
  botId?: string
  directBot?: ChatBot
  mentionBots?: MentionBot[]
  notice?: React.ReactNode
}) {
  const router = useRouter()
  const { checkPlan, showUsageLimit } = usePaywall()
  const publishActivity = usePublishChatActivity()
  const [completion, setCompletion] = useState<ChatActivity>()
  const identities = directBot
    ? [directBot, ...bots, ...mentionBots]
    : [...bots, ...mentionBots]
  const fallbackBotId = directBotId ?? bots[0]?.id
  const chatTransport = useMemo(
    () => navigationChatTransport(transport),
    [transport]
  )
  const {
    messages,
    sendMessage,
    resumeStream,
    status,
    stop: stopLocal,
  } = useChat<ChatUIMessage>({
    id: chatId,
    messages: initialMessages,
    transport: chatTransport,
    onFinish: ({ message, isAbort, isError }) => {
      if (isAbort || isError) return
      const finished = chatActivity([message], "ready", {
        botIds: identities.map((bot) => bot.id),
        fallbackBotId,
        seen: new Set(),
      })
      if (
        finished.state !== "waiting" &&
        finished.botId &&
        message.parts.some((part) => part.type === "text" && part.text.trim())
      )
        setCompletion({ ...finished, state: "complete" })
      if (
        message.parts.some(
          (part) =>
            part.type === "tool-configureBot" &&
            part.state === "output-available"
        )
      )
        router.refresh()
      const destination = message.parts.findLast(
        (part) =>
          (part.type === "tool-createTeammate" ||
            part.type === "tool-createGroupChat" ||
            part.type === "tool-delegateToTeammate") &&
          part.state === "output-available"
      )
      if (
        destination &&
        (destination.type === "tool-createTeammate" ||
          destination.type === "tool-createGroupChat" ||
          destination.type === "tool-delegateToTeammate") &&
        destination.state === "output-available"
      ) {
        router.push(`/chats/${encodeURIComponent(destination.output.chatId)}`)
        router.refresh()
      }
    },
    // The agent refuses a turn once the period's allowance is spent
    onError: (error) => {
      setCompletion(undefined)
      if (error.message === USAGE_LIMIT_ERROR) return showUsageLimit("ai")
      if (
        [
          CHATGPT_LIMIT_ERROR,
          CHATGPT_RECONNECT_ERROR,
          CHATGPT_REQUEST_ERROR,
        ].includes(error.message)
      ) {
        toast.add({
          type: "error",
          title: "ChatGPT reply unavailable",
          description: error.message,
          actionProps: {
            children: "Manage ChatGPT",
            onClick: () => router.push("/usage#chatgpt-plan"),
          },
        })
        return
      }

      if (error.message === MODEL_UNAVAILABLE_ERROR) {
        toast.add({
          type: "error",
          title: "AI model busy",
          description: error.message,
        })
        return
      }

      // Handled here, so nothing else tells us a reply never arrived
      Sentry.logger.error("Chat reply failed", {
        "chat.id": chatId,
        "error.type": error.name,
        "error.message": error.message,
      })
      toast.add({
        type: "error",
        title: "Couldn't complete the reply",
        description: "Please try again.",
      })
    },
  })
  useResumeChatStream({
    chatId,
    initialMessages,
    resumeStream,
    setup,
    transport,
  })
  // The bot the next message goes to, in a group chat
  const [botId, setBotId] = useState(bots[0]?.id)
  const [setupStopped, setSetupStopped] = useState(false)
  const desktop = useOptionalDesktopPanel()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // Falls back to the first one when the picked bot is removed from the group
  const selectedBot = bots.find((bot) => bot.id === botId) ?? bots[0]
  const visibleMessages = messages.filter(
    (message) => !directBotId || message.id !== botSetupMessageId(directBotId)
  )
  const seen = seenMessageIds(messages)
  const answeredQuestions = new Set(
    visibleMessages
      .filter((message) => message.role === "user")
      .map((message) => message.metadata?.questionId)
  )
  const pendingQuestion = visibleMessages
    .flatMap((message) => message.parts)
    .findLast(
      (part) =>
        part.type === "tool-askUser" &&
        part.state === "output-available" &&
        !answeredQuestions.has(part.toolCallId)
    )
  const busy = status === "submitted" || status === "streaming"
  const followUps =
    status === "ready" && !pendingQuestion && !setupStopped
      ? latestFollowUps(visibleMessages)
      : undefined
  const thinking = isChatThinking(
    visibleMessages,
    status,
    setup && !setupStopped,
    seen
  )
  const liveActivity = chatActivity(visibleMessages, status, {
    botIds: identities.map((bot) => bot.id),
    fallbackBotId,
    seen,
    setup: setup && !setupStopped,
  })
  const activity =
    liveActivity.state === "idle" &&
    completion?.messageId === liveActivity.messageId
      ? (completion ?? liveActivity)
      : liveActivity
  const activeAuthor = identities.find((bot) => bot.id === activity.botId)
  const activeMessage = visibleMessages.find(
    (message) => message.id === activity.messageId
  )
  const activeParts = activeMessage
    ? (chatAuthorSections(activeMessage, fallbackBotId)[
        activity.sectionIndex ?? 0
      ]?.parts ?? [])
    : []
  const responseHasAvatar = activeParts.some(
    (part) => (part.type === "text" && part.text.trim()) || isToolUIPart(part)
  )
  const {
    state: activityState,
    botId: activityBotId,
    messageId: activityMessageId,
    sectionIndex: activitySectionIndex,
  } = activity
  useEffect(() => {
    publishActivity?.({
      state: activityState,
      botId: activityBotId,
      messageId: activityMessageId,
      sectionIndex: activitySectionIndex,
    })
  }, [
    publishActivity,
    activityState,
    activityBotId,
    activityMessageId,
    activitySectionIndex,
  ])
  useEffect(() => () => publishActivity?.({ state: "idle" }), [publishActivity])
  useEffect(() => {
    if (!completion) return
    const timer = setTimeout(() => setCompletion(undefined), 1200)
    return () => clearTimeout(timer)
  }, [completion])

  function answerQuestion(
    questionId: string,
    answer: string,
    mentions: BotMention[] = []
  ) {
    if (!checkPlan("bots")) return false
    setCompletion(undefined)
    const responder = activity.state === "waiting" ? activeAuthor : selectedBot
    const metadata = {
      questionId,
      mentions,
      ...(responder && { botId: responder.id }),
    }
    sendMessage({ text: answer, metadata }, { metadata })
  }
  function stop() {
    setCompletion(undefined)
    setSetupStopped(true)
    stopLocal()
    transport.stopGeneration(chatId).catch(() =>
      toast.add({
        type: "error",
        title: "Couldn't stop the reply",
        description: "Try stopping again.",
      })
    )
  }

  function handleSubmit(message: PromptInputMessage, mentions: BotMention[]) {
    if (!message.text.trim()) return false
    // Throwing keeps the draft in the input
    if (!checkPlan("bots")) throw new Error("Upgrade required")
    setCompletion(undefined)
    setSetupStopped(false)
    if (pendingQuestion?.type === "tool-askUser") {
      return answerQuestion(pendingQuestion.toolCallId, message.text, mentions)
    }
    // The agent reads this turn's metadata to decide which bot answers
    // and the message keeps it too, to show who it was for
    const metadata = { ...(selectedBot && { botId: selectedBot.id }), mentions }
    sendMessage({ text: message.text, metadata }, { metadata })
  }

  return (
    <div data-slot="chat" className="flex min-h-0 flex-1 flex-col">
      <Conversation>
        <ConversationContent className="mx-auto w-full max-w-xl gap-3 px-5 py-8 sm:px-8">
          {visibleMessages.length === 0 && !setup && (
            <ConversationEmptyState className="min-h-[45svh] gap-6">
              <BotMark
                shape="blob"
                state="curious"
                color="var(--foreground)"
                className="size-24 [--bg:var(--card)]"
              />
              <div className="max-w-sm space-y-3">
                <h2 className="text-2xl font-medium tracking-tight">
                  Start a conversation
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Give {name} a task, share an idea, or ask a question.
                </p>
              </div>
            </ConversationEmptyState>
          )}
          {visibleMessages.flatMap((message) => {
            // The bot a group chat's message was sent to
            const addressee =
              message.role === "user"
                ? bots.find((bot) => bot.id === message.metadata?.botId)
                : undefined

            return chatAuthorSections(message, fallbackBotId).map(
              ({ botId: authorId, parts }, i) => {
                const contribution = parts.some(
                  (part) =>
                    part.type === "tool-consultTeammate" &&
                    part.state === "output-available"
                )
                const author =
                  message.role === "assistant"
                    ? identities.find((bot) => bot.id === authorId)
                    : undefined
                const current =
                  activity.messageId === message.id &&
                  activity.sectionIndex === i &&
                  activity.botId === author?.id
                const renderedParts = parts.map((part, j) => {
                  if (part.type === "text") {
                    if (!part.text.trim()) return null
                    return (
                      <MessageResponse
                        key={`${message.id}-${i}-${j}`}
                        // Flows the first paragraph inline, right after the tag
                        className={cn(
                          message.role === "assistant" &&
                            "rounded-xl bg-muted/30 px-3 py-2",
                          addressee && j === 0
                            ? "inline [&>p:first-child]:inline"
                            : message.role === "assistant" && j > 0
                              ? "mt-2"
                              : undefined
                        )}
                      >
                        {message.role === "user"
                          ? (message.metadata?.displayPrompt ?? part.text)
                          : part.text}
                      </MessageResponse>
                    )
                  }
                  if (part.type === "tool-askUser") {
                    if (
                      part.state !== "output-available" ||
                      pendingQuestion?.type !== "tool-askUser" ||
                      pendingQuestion.toolCallId !== part.toolCallId
                    )
                      return null
                    return (
                      <ChatQuestion
                        key={part.toolCallId}
                        part={part}
                        active={
                          pendingQuestion?.type === "tool-askUser" &&
                          pendingQuestion.toolCallId === part.toolCallId
                        }
                        busy={busy}
                        onOpenComputer={desktop?.openForLogin}
                        chatId={chatId}
                        botName={author?.name}
                        onResume={() => void resumeStream()}
                        botId={
                          message.metadata?.botId ??
                          directBotId ??
                          selectedBot?.id
                        }
                        onAnswer={(answer) => {
                          if (part.output.computerLogin) desktop?.close()
                          return answerQuestion(part.toolCallId, answer)
                        }}
                        onDismiss={() =>
                          answerQuestion(
                            part.toolCallId,
                            "I'd prefer to explain in the chat instead of choosing an option."
                          )
                        }
                      />
                    )
                  }
                  if (part.type !== "dynamic-tool" && isToolUIPart(part)) {
                    return <ToolCall key={part.toolCallId} part={part} />
                  }
                  return null
                })

                if (!renderedParts.some(Boolean)) return null
                // A reply still streaming in isn't ready to copy
                const copyText =
                  message.role === "assistant" &&
                  !(busy && message.id === visibleMessages.at(-1)?.id)
                    ? sectionText(parts)
                    : ""

                return (
                  <Message
                    from={message.role}
                    key={`${message.id}-${i}`}
                    className={
                      author || contribution
                        ? "flex-row items-start"
                        : undefined
                    }
                  >
                    {author && (
                      <ChatAvatar
                        seed={author.avatar}
                        identity={author.id}
                        state={current ? activity.state : "idle"}
                        className="mt-1 size-6"
                      />
                    )}
                    {!author && contribution && (
                      <UsersRoundIcon
                        aria-hidden="true"
                        className="mt-1 size-6 shrink-0 text-muted-foreground"
                      />
                    )}
                    <MessageContent
                      className={
                        message.role === "assistant"
                          ? "w-full gap-2"
                          : undefined
                      }
                    >
                      {author && !contribution && (
                        <span className="sr-only">{author.name}</span>
                      )}
                      {message.role === "user" &&
                      message.metadata?.mentions?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {[
                            ...new Set(
                              message.metadata.mentions.map(
                                (mention) => mention.botId
                              )
                            ),
                          ].map((id) => {
                            const tagged = mentionBots.find(
                              (bot) => bot.id === id
                            )
                            return (
                              <Badge
                                key={id}
                                variant="outline"
                                className="max-w-48"
                              >
                                <span className="truncate">
                                  @{tagged?.name ?? "Deleted teammate"}
                                </span>
                              </Badge>
                            )
                          })}
                        </div>
                      ) : null}
                      {addressee ? (
                        // One block, so the tag and the text share a line and the text wraps under it
                        <div>
                          <Badge
                            variant="outline"
                            className="mr-1.5 max-w-40 pl-1 align-top"
                          >
                            <ChatAvatar
                              seed={addressee.avatar}
                              className="size-3.5"
                            />
                            <span className="truncate">{addressee.name}</span>
                          </Badge>
                          {renderedParts}
                        </div>
                      ) : (
                        renderedParts
                      )}
                      {copyText && <ChatMessageActions text={copyText} />}
                    </MessageContent>
                    {message.role === "user" && seen.has(message.id) && (
                      <span
                        className="pr-1 text-right text-[11px] leading-none text-muted-foreground"
                        aria-live="polite"
                      >
                        Seen
                      </span>
                    )}
                  </Message>
                )
              }
            )
          })}
          {activity.state !== "idle" && activity.state !== "error" && (
            // The live response owns its avatar once it has visible content.
            <div
              className="flex min-h-7 items-center gap-2 text-xs text-muted-foreground"
              data-slot="chat-activity"
              data-state={activity.state}
            >
              {activeAuthor && (thinking || !responseHasAvatar) && (
                <ChatAvatar
                  seed={activeAuthor.avatar}
                  identity={activeAuthor.id}
                  state={activity.state}
                  className="size-6"
                />
              )}
              <span>
                {activeAuthor && bots.length > 0
                  ? `${activeAuthor.name} · `
                  : ""}
                {avatarStatusInProgress(activity.state) ? (
                  <Shimmer as="span" duration={1.6}>
                    {avatarStatusLabels[activity.state]}
                  </Shimmer>
                ) : (
                  avatarStatusLabels[activity.state]
                )}
              </span>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div
        data-compact={!selectedBot}
        className="chat-composer mx-auto w-full max-w-4xl px-4 pt-2 pb-5 sm:px-6"
      >
        {notice}
        <PromptInputProvider>
          {followUps && (
            <ChatFollowUps
              suggestions={followUps.suggestions}
              inputRef={inputRef}
              onSelect={() => {
                if (bots.some((bot) => bot.id === followUps.botId))
                  setBotId(followUps.botId)
              }}
            />
          )}
          <ChatComposer
            onSubmit={handleSubmit}
            bots={mentionBots}
            memberIds={identities.map((bot) => bot.id)}
            responderId={selectedBot?.id ?? directBotId}
            inputRef={inputRef}
            placeholder={`Message ${name}…`}
            textareaClassName={
              selectedBot
                ? "min-h-14 px-3 text-base sm:text-sm"
                : "min-h-10 px-3 py-2.5 pr-14 text-base sm:text-sm"
            }
          >
            <PromptInputFooter
              className={
                selectedBot
                  ? undefined
                  : "absolute top-1/2 right-2 w-auto -translate-y-1/2 justify-end p-0"
              }
            >
              {selectedBot && (
                <PromptInputTools>
                  <PromptInputSelect
                    value={selectedBot.id}
                    onValueChange={(value) => setBotId(value as string)}
                  >
                    <PromptInputSelectTrigger aria-label="Bot to talk to">
                      <PromptInputSelectValue>
                        <ChatAvatar
                          seed={selectedBot.avatar}
                          interactive
                          className="size-5"
                        />
                        {selectedBot.name}
                      </PromptInputSelectValue>
                    </PromptInputSelectTrigger>
                    <PromptInputSelectContent>
                      {bots.map((bot) => (
                        <PromptInputSelectItem key={bot.id} value={bot.id}>
                          <ChatAvatar seed={bot.avatar} className="size-5" />
                          {bot.name}
                        </PromptInputSelectItem>
                      ))}
                    </PromptInputSelectContent>
                  </PromptInputSelect>
                </PromptInputTools>
              )}
              <PromptInputSubmit status={status} onStop={stop}>
                {busy ? (
                  <SquareIcon className="size-4" />
                ) : (
                  <ArrowUpIcon className="size-4" />
                )}
              </PromptInputSubmit>
            </PromptInputFooter>
          </ChatComposer>
        </PromptInputProvider>
      </div>
    </div>
  )
}

export { Chat }
