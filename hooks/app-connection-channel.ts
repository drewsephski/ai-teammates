"use client"

import { useEffect, useRef } from "react"

export const APP_CONNECTION_CHANNEL = "krafty:app-connection"

export type AppConnectionMessage = {
  questionId: string
  connected: boolean
  woke?: boolean
  /** Input sequence of the message that woke the bot, to attach to its turn. */
  inputSeq?: number
}

/** What the chat card should do with a completion reported by the popup. */
export type AppConnectionOutcome = "settle" | "answer" | "retry" | "ignore"

export function appConnectionOutcome(
  message: unknown,
  questionId: string
): AppConnectionOutcome {
  if (!message || typeof message !== "object") return "ignore"
  const { questionId: id, connected, woke } = message as AppConnectionMessage
  if (id !== questionId) return "ignore"
  if (!connected) return "retry"
  // The server already woke the bot; otherwise fall back to the answer.
  return woke === true ? "settle" : "answer"
}

/** Tells other tabs of this browser that a card-started connection finished. */
export function postAppConnection(message: AppConnectionMessage) {
  if (typeof BroadcastChannel === "undefined") return
  const channel = new BroadcastChannel(APP_CONNECTION_CHANNEL)
  channel.postMessage(message)
  channel.close()
}

export function useAppConnectionResult(
  questionId: string,
  onOutcome: (
    outcome: Exclude<AppConnectionOutcome, "ignore">,
    message: AppConnectionMessage
  ) => void
) {
  const handler = useRef(onOutcome)
  useEffect(() => {
    handler.current = onOutcome
  })
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return
    const channel = new BroadcastChannel(APP_CONNECTION_CHANNEL)
    channel.onmessage = (event: MessageEvent) => {
      const outcome = appConnectionOutcome(event.data, questionId)
      if (outcome !== "ignore")
        handler.current(outcome, event.data as AppConnectionMessage)
    }
    return () => channel.close()
  }, [questionId])
}

type SessionState = { isStreaming?: boolean; activeInputSeq?: number }

/**
 * Attaches the chat to the turn the server started after a connection. The web
 * transport isn't watching, so it must be told a turn is streaming and which
 * input started it before resumeStream will subscribe. Without the sequence a
 * resume could pick up the previous turn's end, so `fallback` runs instead.
 */
export function resumeAfterWake({
  inputSeq,
  chatId,
  transport,
  resume,
  fallback,
}: {
  inputSeq?: number
  chatId: string
  transport: {
    getSession(chatId: string): SessionState | undefined
    setSession(chatId: string, session: never): void
  }
  resume: () => void
  fallback: () => void
}) {
  if (inputSeq === undefined) {
    fallback()
    return
  }
  const session = transport.getSession(chatId)
  if (session)
    transport.setSession(chatId, {
      ...session,
      isStreaming: true,
      activeInputSeq: inputSeq,
    } as never)
  resume()
}
