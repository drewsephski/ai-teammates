"use client"

import { useCallback, useRef, useState } from "react"
import { demoAgents, type DemoEntry, type DemoAgent } from "./chat-demo-data"

export type DemoConfirmationHandler = (
  id: string,
  text: string,
  name: string
) => void

export type DemoDecisionState = "pending" | "running" | "executed" | "denied"
export function pendingDemoDecisions(
  chatId: string,
  entries: DemoEntry[],
  decisions: Record<string, DemoDecisionState>
) {
  return entries.reduce(
    (count, entry, index) =>
      count +
      ((entry.kind === "approval" || entry.kind === "email") &&
      (decisions[`${chatId}:${index}`] ?? entry.initialState ?? "pending") ===
        "pending"
        ? 1
        : 0),
    0
  )
}

/** Reading a conversation and resolving its requests are independent events. */
export function useDemoInbox() {
  const [selectedId, setSelectedId] = useState("new-bot")
  const activeChat = useRef(selectedId)
  const [unread, setUnread] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(demoAgents.map((agent) => [agent.id, agent.unread]))
  )
  const [decisions, setDecisions] = useState<Record<string, DemoDecisionState>>(
    {}
  )
  const nextEvent = useRef(0)
  const [replies, setReplies] = useState<
    Record<
      string,
      {
        id: string
        chatId: string
        text: string
        name: string
        kind?: "user" | "agent"
        botId?: string
        order: number
      }
    >
  >({})
  const [setupWaiting, setSetupWaiting] = useState(false)
  const [setupWaitingKind, setSetupWaitingKind] = useState<
    "response" | "approval"
  >("response")
  const receive = useCallback((chatId: string) => {
    if (activeChat.current !== chatId)
      setUnread((current) => ({ ...current, [chatId]: true }))
  }, [])
  const recordReply = useCallback<DemoConfirmationHandler>(
    (id, text, name) => {
      const chatId = id.slice(0, id.lastIndexOf(":"))
      const order = ++nextEvent.current
      setReplies((current) => {
        const next = { ...current }
        if (text) next[id] = { id, chatId, text, name, order }
        else delete next[id]
        return next
      })
      if (text) receive(chatId)
    },
    [receive]
  )
  const recordMessage = useCallback(
    (chatId: string, text: string, kind: "user" | "agent", bot: DemoAgent) => {
      const order = ++nextEvent.current
      const id = `${chatId}:message_${order}`
      setReplies((current) => ({
        ...current,
        [id]: { id, chatId, text, name: bot.name, botId: bot.id, kind, order },
      }))
      if (kind === "agent") receive(chatId)
    },
    [receive]
  )
  const selectChat = useCallback((chatId: string) => {
    activeChat.current = chatId
    setSelectedId(chatId)
    setUnread((current) => ({ ...current, [chatId]: false }))
  }, [])
  const recordDecision = useCallback(
    (id: string, state: DemoDecisionState) => {
      setDecisions((current) => ({ ...current, [id]: state }))
      if (state === "executed" || state === "denied")
        receive(id.slice(0, id.lastIndexOf(":")))
    },
    [receive]
  )
  const reportSetupWaiting = useCallback(
    (waiting: boolean, kind: "response" | "approval" = "response") => {
      setSetupWaiting(waiting)
      setSetupWaitingKind(kind)
      if (waiting) receive("new-bot")
    },
    [receive]
  )
  return {
    selectedId,
    selectChat,
    unread,
    decisions,
    replies,
    recordReply,
    recordMessage,
    recordDecision,
    setupWaiting,
    setupWaitingKind,
    reportSetupWaiting,
    receive,
  }
}
