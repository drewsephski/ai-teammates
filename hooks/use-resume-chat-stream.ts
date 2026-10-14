"use client"

import { useEffect } from "react"
import type { TriggerChatTransport } from "@trigger.dev/sdk/chat"
import type { ChatUIMessage } from "@/lib/sandbox-tools"

export function useResumeChatStream({
  chatId,
  initialMessages,
  resumeStream,
  setup,
  transport,
}: {
  chatId: string
  initialMessages: ChatUIMessage[]
  resumeStream: () => Promise<void>
  setup: boolean
  transport: TriggerChatTransport
}) {
  useEffect(() => {
    // Strict Mode cleanup must run before opening the subscription.
    const timer = setTimeout(() => {
      const session = transport.getSession(chatId)
      if (
        setup &&
        session &&
        !initialMessages.some((message) => message.role === "assistant")
      )
        transport.setSession(chatId, {
          ...session,
          isStreaming: true,
          activeInputSeq: 0,
        })
      void resumeStream()
    }, 0)
    return () => clearTimeout(timer)
  }, [chatId, initialMessages, resumeStream, setup, transport])
}
