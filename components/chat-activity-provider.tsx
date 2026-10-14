"use client"

import { createContext, useContext, useState } from "react"
import type { ChatActivity } from "@/lib/chat-activity"

const idle: ChatActivity = { state: "idle" }
const ActivityContext = createContext<ChatActivity>(idle)
const PublishContext = createContext<
  ((activity: ChatActivity) => void) | undefined
>(undefined)

// Scoped to one chat page, so navigation cannot carry an old bot's activity.
export function ChatActivityProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [activity, setActivity] = useState<ChatActivity>(idle)
  return (
    <PublishContext value={setActivity}>
      <ActivityContext value={activity}>{children}</ActivityContext>
    </PublishContext>
  )
}

export function useChatActivity() {
  return useContext(ActivityContext)
}

export function usePublishChatActivity() {
  return useContext(PublishContext)
}
