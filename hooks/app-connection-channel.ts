"use client"

import { useEffect, useRef } from "react"

export const APP_CONNECTION_CHANNEL = "krafty:app-connection"

export type AppConnectionMessage = {
  questionId: string
  connected: boolean
  woke?: boolean
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
  onOutcome: (outcome: Exclude<AppConnectionOutcome, "ignore">) => void
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
      if (outcome !== "ignore") handler.current(outcome)
    }
    return () => channel.close()
  }, [questionId])
}
