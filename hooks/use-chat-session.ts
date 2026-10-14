"use client"

import { useEffect, useState } from "react"
import type { TriggerChatTransport } from "@trigger.dev/sdk/chat"
import type { ChatUIMessage } from "@/lib/sandbox-tools"

type Transcript = {
  messages: ChatUIMessage[]
  cursors?: { lastOutEventId?: string }
}

// The transcript and its cursor must be restored together on every visit.
// A reused transport may have read past the saved transcript before navigation.
export function useChatSession({
  chatId,
  transport,
  loadTranscript,
  attempt,
}: {
  chatId: string
  transport: TriggerChatTransport
  loadTranscript: (params: { chatId: string }) => Promise<Transcript>
  attempt: number
}) {
  const [state, setState] = useState<{
    chatId: string
    attempt: number
    messages?: ChatUIMessage[]
    error?: Error
  }>()

  const active = state?.chatId === chatId && state.attempt === attempt
  // Reset before children render, including a rapid A → B → A return.
  if (!active) setState({ chatId, attempt })

  useEffect(() => {
    let current = true
    Promise.all([transport.preload(chatId), loadTranscript({ chatId })])
      .then(([, transcript]) => {
        if (!current) return
        const session = transport.getSession(chatId)
        if (!session) throw new Error("Chat session unavailable")
        // Omit isStreaming: preload assumes idle, but only the server knows
        // whether a turn is active. Replay from the saved transcript's cursor.
        transport.setSession(chatId, {
          publicAccessToken: session.publicAccessToken,
          lastEventId: transcript.cursors?.lastOutEventId,
        })
        setState({ chatId, attempt, messages: transcript.messages })
      })
      .catch((cause: unknown) => {
        if (current)
          setState({
            chatId,
            attempt,
            error: cause instanceof Error ? cause : new Error(String(cause)),
          })
      })
    return () => {
      current = false
    }
  }, [chatId, transport, loadTranscript, attempt])

  return {
    messages: active ? (state.messages ?? []) : [],
    isLoading: !active || (!state.messages && !state.error),
    error: active ? state.error : undefined,
  }
}
