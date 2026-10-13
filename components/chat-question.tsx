"use client"

import { useRef } from "react"
import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
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
}: {
  part: QuestionPart
  active: boolean
  busy: boolean
  onAnswer: (answer: string) => void
  onDismiss: () => void
}) {
  const answered = useRef(false)
  if (part.state === "output-available")
    return (
      <p className="text-xs text-muted-foreground">
        Your answer: {part.output.answer}
      </p>
    )
  if (part.state !== "input-available" || !part.input) return null
  const disabled = !active || busy
  function answer(value: string) {
    if (answered.current || disabled || !value.trim()) return
    answered.current = true
    onAnswer(value.trim())
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
        onClick={() => {
          if (answered.current) return
          answered.current = true
          onDismiss()
        }}
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
          <QuestionnaireTitle><span className="block pr-6">{part.input.question}</span></QuestionnaireTitle>
          <QuestionnaireChoices>
            {part.input.options.map((option) => (
              <QuestionnaireChoice
                key={option}
                value={option}
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
