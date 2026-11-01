"use client"

import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { useEffect, useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

import { MessageAction, MessageActions } from "@/components/ai-elements/message"
import { toast } from "@/components/ui/toast"
import { turnUsageLabel, type TurnUsage } from "@/lib/turn-spend"

// Hidden until the reply is hovered or focused where a pointer can hover;
// always visible on touch screens
function ChatMessageActions({
  text,
  usage,
}: {
  text?: string
  usage?: TurnUsage
}) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const spend = usage && turnUsageLabel(usage)
  if (!text && !spend) return null
  const spendTitle = usage?.chatgpt
    ? "Used from your Krafty allowance for web search and checks. The model ran on your ChatGPT plan."
    : "Used from your Krafty AI allowance by this reply"

  return (
    <MessageActions
      data-slot="chat-message-actions"
      className="-mt-1 transition-opacity focus-within:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
    >
      {text && (
        <MessageAction
          label={copied ? "Copied" : "Copy reply"}
          className="size-7 text-muted-foreground"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text)
              setCopied(true)
            } catch {
              toast.add({
                type: "error",
                title: "Couldn't copy the reply",
                description: "Select the text and copy it instead.",
              })
            }
          }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </MessageAction>
      )}
      {spend && (
        <Tooltip>
          <TooltipTrigger
            tabIndex={0}
            render={
              <span
                data-slot="chat-turn-spend"
                className="px-1.5 text-xs text-muted-foreground tabular-nums"
              >
                {spend}
                <span className="sr-only"> {spendTitle.toLowerCase()}</span>
              </span>
            }
          />
          <TooltipContent>{spendTitle}</TooltipContent>
        </Tooltip>
      )}
    </MessageActions>
  )
}

export { ChatMessageActions }
