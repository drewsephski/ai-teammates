import type { ChatUIMessage } from "@/lib/sandbox-tools"

// Receipts come from the agent's persisted response, never an optimistic send.
export function seenMessageIds(messages: readonly ChatUIMessage[]) {
  const users = new Set(messages.filter((message) => message.role === "user").map((message) => message.id))
  const seen = new Set<string>()
  for (const message of messages) {
    if (message.role !== "assistant") continue
    for (const part of message.parts)
      if (part.type === "data-messageSeen" && users.has(part.data.messageId))
        seen.add(part.data.messageId)
  }
  return seen
}
