"use client"

import { useChat } from "@ai-sdk/react"
import * as Sentry from "@sentry/nextjs"
import type { TriggerChatTransport } from "@trigger.dev/sdk/chat"
import {
  useLoadTranscript,
  useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react"
import { isToolUIPart } from "ai"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpIcon, SquareIcon } from "lucide-react"
import { toast } from "@/components/ui/toast"

import {
  loadTranscript,
  mintChatAccessToken,
  startChatSession,
} from "@/actions/chat"

import { ChatAvatar } from "@/components/chat-avatar"
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
  PromptInput,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input"
import { ToolCall } from "@/components/chat-tool-call"
import { ChatQuestion } from "@/components/chat-question"
import { Button } from "@/components/ui/button"
import { botSetupMessageId } from "@/lib/bot-setup-tools"
import { cn } from "@/lib/utils"
import { BotMark } from "@/components/landing/bot/bot-mark"
import { TextShimmer } from "@/components/ai-elements/shimmer"
import { isChatThinking } from "@/lib/chat-thinking"
import { seenMessageIds } from "@/lib/chat-receipts"
import { Badge } from "@/components/ui/badge"
import type { Bot } from "@/db/schema"
import { USAGE_LIMIT_ERROR } from "@/lib/billing"
import { usePaywall } from "@/hooks/use-paywall"
import type { ChatUIMessage } from "@/lib/sandbox-tools"
import type { chatAgent } from "@/trigger/chat"

type ChatBot = Pick<Bot, "id" | "name" | "avatar">

function ChatThinking({ delay = 0 }: { delay?: number }) {
  const [visible, setVisible] = useState(delay === 0)
  useEffect(() => {
    if (delay === 0) return
    const timer = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  if (!visible) return null

  return (
    <div role="status" className="text-sm text-muted-foreground">
      <TextShimmer
        baseColor="var(--muted-foreground)"
        shimmerColor="var(--foreground)"
      >
        Thinking…
      </TextShimmer>
    </div>
  )
}

// A reply is one message even when a handoff changes who is writing it, so it
// is cut at each handoff and every stretch gets its own author. Only a group
// chat passes bots, so only its replies get a face.
function splitByAuthor(message: ChatUIMessage, bots: ChatBot[]) {
  const findBot = (botId?: string) => bots.find((bot) => bot.id === botId)

  let section = {
    author:
      message.role === "assistant"
        ? findBot(message.metadata?.botId)
        : undefined,
    parts: [] as ChatUIMessage["parts"],
  }
  const sections = [section]

  for (const part of message.parts) {
    section.parts.push(part)

    if (part.type === "tool-handoff" && part.state === "output-available") {
      section = { author: findBot(part.output.botId), parts: [] }
      sections.push(section)
    }
  }

  return sections
}

// `bots` are a group chat's members to pick from; a direct chat passes none
function Chat({
  chatId,
  name,
  bots,
  setup = false,
  botId,
}: {
  chatId: string
  name: string
  bots?: ChatBot[]
  setup?: boolean
  botId?: string
}) {
  const transport = useTriggerChatTransport<typeof chatAgent>({
    task: "chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startChatSession({ chatId, clientData }),
  })
  const [startup, setStartup] = useState<{ chatId: string; error?: string }>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!setup) return
    let current = true
    transport
      .preload(chatId)
      .then(() => {
        // The SDK assumes a preloaded session is idle. Our server starts its
        // opening turn immediately, so let the server decide when it is settled.
        const session = transport.getSession(chatId)
        if (session) {
          const resumable = { ...session }
          delete resumable.isStreaming
          transport.setSession(chatId, resumable)
        }
        if (current) setStartup({ chatId })
      })
      .catch(() => {
        if (current)
          setStartup({
            chatId,
            error: "Couldn't start your setup conversation.",
          })
      })
    return () => {
      current = false
    }
  }, [chatId, setup, transport, attempt])
  const { messages, isLoading, error } = useLoadTranscript(
    chatId,
    loadTranscript,
    {
      transport,
    }
  )

  if (error || (setup && startup?.chatId === chatId && startup.error))
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {error ? "Couldn't load your conversation." : startup?.error}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            if (error) window.location.reload()
            else {
              setStartup(undefined)
              setAttempt((value) => value + 1)
            }
          }}
        >
          Try again
        </Button>
      </div>
    )

  // useChat only reads its initial messages on mount, so wait for the transcript
  if (isLoading || (setup && startup?.chatId !== chatId))
    return (
      <Conversation>
        <ConversationContent className="mx-auto w-full max-w-xl px-5 py-8 sm:px-8">
          <ChatThinking />
        </ConversationContent>
      </Conversation>
    )

  return (
    <ChatMessages
      key={chatId}
      chatId={chatId}
      name={name}
      bots={bots}
      setup={setup}
      botId={botId}
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
}: {
  chatId: string
  name: string
  bots?: ChatBot[]
  initialMessages: ChatUIMessage[]
  transport: TriggerChatTransport
  setup: boolean
  botId?: string
}) {
  const router = useRouter()
  const { checkPlan, showUsageLimit } = usePaywall()
  const {
    messages,
    sendMessage,
    resumeStream,
    status,
    stop: stopLocal,
  } = useChat<ChatUIMessage>({
    id: chatId,
    messages: initialMessages,
    transport,
    onFinish: ({ message, isAbort, isError }) => {
      if (isAbort || isError) return
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
      if (error.message === USAGE_LIMIT_ERROR) return showUsageLimit("ai")

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
  useEffect(() => {
    if (!setup) return
    // Automatic resume races the subscription aborted by Strict Mode cleanup.
    // Defer one task: the simulated mount is cancelled before opening a stream.
    const timer = setTimeout(() => {
      const session = transport.getSession(chatId)
      if (
        session &&
        !initialMessages.some((message) => message.role === "assistant")
      )
        transport.setSession(chatId, {
          ...session,
          isStreaming: true,
          // The server submits the opening turn before any client input.
          activeInputSeq: 0,
        })
      void resumeStream()
    }, 0)
    return () => clearTimeout(timer)
  }, [chatId, initialMessages, resumeStream, setup, transport])
  // The bot the next message goes to, in a group chat
  const [botId, setBotId] = useState(bots[0]?.id)
  const [setupStopped, setSetupStopped] = useState(false)
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
  const latestUser = visibleMessages.findLast(
    (message) => message.role === "user"
  )
  const thinking = isChatThinking(
    visibleMessages,
    status,
    setup && !setupStopped,
    seen
  )

  function answerQuestion(questionId: string, answer: string) {
    if (!checkPlan("bots")) return
    const metadata = {
      questionId,
      ...(selectedBot && { botId: selectedBot.id }),
    }
    sendMessage({ text: answer, metadata }, { metadata })
  }
  function stop() {
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

  function handleSubmit(message: PromptInputMessage) {
    if (!message.text.trim()) return
    // Throwing keeps the draft in the input
    if (!checkPlan("bots")) throw new Error("Upgrade required")
    if (pendingQuestion?.type === "tool-askUser") {
      answerQuestion(pendingQuestion.toolCallId, message.text)
      return
    }
    // The agent reads this turn's metadata to decide which bot answers
    // and the message keeps it too, to show who it was for
    const metadata = selectedBot && { botId: selectedBot.id }
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

            return splitByAuthor(message, bots).map(({ author, parts }, i) => {
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
                      {part.text}
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
                      onAnswer={(answer) =>
                        answerQuestion(part.toolCallId, answer)
                      }
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

              return (
                <Message
                  from={message.role}
                  key={`${message.id}-${i}`}
                  className={author && "flex-row items-start"}
                >
                  {author && (
                    <ChatAvatar seed={author.avatar} className="size-6" />
                  )}
                  <MessageContent
                    className={
                      message.role === "assistant" ? "w-full gap-2" : undefined
                    }
                  >
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
            })
          })}
          {thinking && (
            // Let Seen paint before the shimmer starts; a new prompt remounts
            // the timer, and an early response or stop cancels it.
            <ChatThinking
              key={latestUser?.id ?? "setup"}
              delay={latestUser ? 350 : 0}
            />
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div
        data-compact={!selectedBot}
        className="chat-composer mx-auto w-full max-w-4xl px-4 pt-2 pb-5 sm:px-6"
      >
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea
            placeholder={`Message ${name}…`}
            className={
              selectedBot
                ? "min-h-14 px-3 text-base sm:text-sm"
                : "min-h-10 px-3 py-2.5 pr-14 text-base sm:text-sm"
            }
          />
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
        </PromptInput>
      </div>
    </div>
  )
}

export { Chat }
