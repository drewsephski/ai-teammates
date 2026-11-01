"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { TriggerChatTransport } from "@trigger.dev/sdk/chat"

// A card's decision is sent by the server, outside useChat. Resume from its
// input cursor, after any current reply, so neither confirmation is skipped.
export function useApprovalConfirmation({
  chatId,
  transport,
  resumeStream,
  busy,
  completedInputSeq,
  onMissingCursor,
}: {
  chatId: string
  transport: TriggerChatTransport
  resumeStream: () => Promise<void>
  busy: boolean
  completedInputSeq?: number
  onMissingCursor: () => void
}) {
  const [pending, setPending] = useState<number[]>([])
  const resuming = useRef(false)
  const seen = useRef(new Set<number>())
  const completed = useRef(-1)

  // The agent can consume several queued decisions in one turn. Its committed
  // input cursor confirms all of them; don't wait for another, empty turn.
  useEffect(() => {
    if (completedInputSeq !== undefined)
      completed.current = Math.max(completed.current, completedInputSeq)
  }, [completedInputSeq])

  useEffect(() => {
    const inputSeq = pending.find((seq) => seq > (completedInputSeq ?? -1))
    if (busy || resuming.current || inputSeq === undefined) return
    // Let Strict Mode's first cleanup cancel before opening the subscription.
    const timer = setTimeout(() => {
      resuming.current = true
      const session = transport.getSession(chatId)
      if (session)
        transport.setSession(chatId, {
          ...session,
          isStreaming: true,
          activeInputSeq: inputSeq,
        })
      void resumeStream()
        // useChat's onError reports stream failures without resending the action.
        .catch(() => {})
        .finally(() => {
          resuming.current = false
          setPending((items) =>
            items.filter((seq) => seq > Math.max(inputSeq, completed.current))
          )
        })
    }, 0)
    return () => clearTimeout(timer)
  }, [busy, pending, completedInputSeq, chatId, transport, resumeStream])

  return useCallback(
    (inputSeq?: number) => {
      if (inputSeq === undefined) {
        onMissingCursor()
        return
      }
      if (inputSeq <= completed.current) return
      if (seen.current.has(inputSeq)) return
      seen.current.add(inputSeq)
      setPending((items) => [...items, inputSeq].sort((a, b) => a - b))
    },
    [onMissingCursor]
  )
}
