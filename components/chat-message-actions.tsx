"use client"

import { useEffect, useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

import { MessageAction, MessageActions } from "@/components/ai-elements/message"
import { toast } from "@/components/ui/toast"

// Hidden until the reply is hovered or focused where a pointer can hover;
// always visible on touch screens
function ChatMessageActions({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <MessageActions
      data-slot="chat-message-actions"
      className="-mt-1 transition-opacity focus-within:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
    >
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
    </MessageActions>
  )
}

export { ChatMessageActions }
