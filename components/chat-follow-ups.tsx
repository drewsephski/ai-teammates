"use client"

import { CornerDownRightIcon } from "lucide-react"
import type { RefObject } from "react"
import { usePromptInputController } from "@/components/ai-elements/prompt-input"
import { Button } from "@/components/ui/button"
import type { ChatFollowUp } from "@/lib/chat-follow-ups"

export function ChatFollowUps({
  suggestions,
  inputRef,
  onSelect,
}: {
  suggestions: ChatFollowUp[]
  inputRef: RefObject<HTMLTextAreaElement | null>
  onSelect?: () => void
}) {
  const { textInput } = usePromptInputController()
  if (textInput.value.trim() || !suggestions.length) return null

  return (
    <div
      role="group"
      aria-label="Suggested follow-up prompts"
      className="mb-1 flex flex-wrap items-center justify-center gap-x-2 px-1"
    >
      {suggestions.map(({ label, prompt }) => (
        <Button
          key={prompt}
          type="button"
          variant="ghost"
          size="sm"
          title={prompt}
          className="h-auto min-h-11 max-w-full min-w-0 justify-start gap-1.5 px-2 py-1.5 text-left text-xs font-normal whitespace-normal text-muted-foreground sm:min-h-9"
          onClick={() => {
            // Recheck on click so a suggestion never overwrites a fresh draft.
            if (textInput.value.trim()) return
            onSelect?.()
            textInput.setInput(prompt)
            inputRef.current?.focus()
          }}
        >
          <CornerDownRightIcon aria-hidden="true" className="size-3" />
          <span className="min-w-0 break-words">{label}</span>
        </Button>
      ))}
    </div>
  )
}
