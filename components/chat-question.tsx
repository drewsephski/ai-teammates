"use client"

import { useRef, useState } from "react"
import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AppConnectionCardView } from "@/components/chat-app-connection"
import { ComputerLoginCard } from "@/components/chat-computer-login"
import {
  Questionnaire,
  QuestionnaireChoice,
  QuestionnaireChoices,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireTitle,
} from "@/components/ui/questionnaire"
import type { ChatUIMessage } from "@/lib/sandbox-tools"

type QuestionPart = Extract<
  ChatUIMessage["parts"][number],
  { type: "tool-askUser" }
>

export function ChatQuestion({
  part,
  active,
  busy,
  onAnswer,
  onDismiss,
  onOpenComputer,
  chatId,
  botId,
  botName,
  onResume,
  assistantCount,
}: {
  part: QuestionPart
  active: boolean
  busy: boolean
  onAnswer: (answer: string) => void | boolean | Promise<void | boolean>
  onDismiss: () => void | boolean | Promise<void | boolean>
  onOpenComputer?: () => Promise<void>
  chatId?: string
  /** The bot that asked, from the message metadata. */
  botId?: string
  botName?: string
  /** Picks up a turn the server started after the connection completed. */
  onResume?: (inputSeq?: number) => void
  assistantCount?: number
}) {
  const answered = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  // The app whose card started a connection, when there is one card per app
  const [activeToolkit, setActiveToolkit] = useState<string>()
  if (!active || part.state !== "output-available") return null
  if (part.output.computerLogin && onOpenComputer)
    return (
      <ComputerLoginCard
        login={part.output.computerLogin}
        busy={busy}
        onAnswer={onAnswer}
        onOpen={onOpenComputer}
      />
    )
  if (part.output.appConnection) {
    const connections = part.output.appConnections ?? [
      part.output.appConnection,
    ]
    const question = part.output.question
    return (
      <div className="flex flex-col gap-2">
        {connections.length > 1 && <p className="text-sm">{question}</p>}
        {connections.map((connection, index) => (
          <AppConnectionCardView
            key={connection.toolkit}
            connection={connection}
            question={question}
            botName={botName}
            onResume={onResume}
            assistantCount={assistantCount}
            busy={busy}
            chatId={chatId}
            questionId={part.toolCallId}
            botId={botId}
            onAnswer={onAnswer}
            primary={index === 0}
            showQuestion={connections.length === 1}
            showAlternatives={index === connections.length - 1}
            peerActive={
              activeToolkit !== undefined &&
              activeToolkit !== connection.toolkit
            }
            onActive={setActiveToolkit}
          />
        ))}
      </div>
    )
  }
  const disabled = !active || busy || submitting
  async function submit(action: () => ReturnType<typeof onDismiss>) {
    if (answered.current || disabled) return
    answered.current = true
    setSubmitting(true)
    try {
      // Keep the lock through this event's click/change handlers, even when the
      // parent throws synchronously, so one selection submits only once.
      if ((await Promise.resolve().then(action)) === false)
        answered.current = false
    } catch {
      answered.current = false
    } finally {
      setSubmitting(false)
    }
  }
  function answer(value: string) {
    if (!value.trim()) return
    void submit(() => onAnswer(value.trim()))
  }
  return (
    <div className="relative rounded-xl bg-muted/40 p-3">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="absolute top-2 right-2"
        aria-label="Dismiss question"
        disabled={disabled}
        onClick={() => void submit(onDismiss)}
      >
        <XIcon />
      </Button>
      <Questionnaire
        shortcuts="letters"
        onSubmit={(event) => {
          event.preventDefault()
          const value = new FormData(event.currentTarget)
            .getAll("answer")
            .find((value) => typeof value === "string" && value.trim())
          if (typeof value === "string") answer(value)
        }}
      >
        <QuestionnaireItem name="answer" required disabled={disabled}>
          <QuestionnaireTitle>
            <span className="block pr-6">{part.output.question}</span>
          </QuestionnaireTitle>
          <QuestionnaireChoices>
            {part.output.options.map((option) => (
              <QuestionnaireChoice
                key={option}
                value={option}
                onClick={() => answer(option)}
                onChange={(event) => {
                  if (event.target.checked) answer(option)
                }}
              >
                {option}
              </QuestionnaireChoice>
            ))}
          </QuestionnaireChoices>
          <QuestionnaireInput
            placeholder="Type your own answer"
            aria-label="Your answer"
            maxLength={2000}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                answer(event.currentTarget.value)
              }
            }}
          />
        </QuestionnaireItem>
      </Questionnaire>
    </div>
  )
}
