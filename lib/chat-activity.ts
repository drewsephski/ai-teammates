import { isToolUIPart, type ChatStatus } from "ai"
import type { ChatUIMessage } from "./sandbox-tools"
import type { AvatarState } from "./avatar-state"

export type ChatActivity = {
  state: AvatarState
  botId?: string
  messageId?: string
  sectionIndex?: number
}

// Consultations temporarily change the author; handoffs change it for the turn.
export function chatAuthorSections(
  message: ChatUIMessage,
  fallbackBotId?: string
) {
  let section = {
    botId: message.metadata?.botId ?? fallbackBotId,
    parts: [] as ChatUIMessage["parts"],
  }
  const sections = [section]
  for (const part of message.parts) {
    if (
      message.role === "assistant" &&
      part.type === "tool-consultTeammate" &&
      part.state === "output-available"
    ) {
      sections.push({ botId: part.output.botId, parts: [part] })
      section = { botId: section.botId, parts: [] }
      sections.push(section)
      continue
    }
    section.parts.push(part)
    if (part.type === "tool-handoff" && part.state === "output-available") {
      section = { botId: part.output.botId, parts: [] }
      sections.push(section)
    }
  }
  return sections
}

export function chatActivity(
  messages: readonly ChatUIMessage[],
  status: ChatStatus,
  {
    botIds,
    fallbackBotId,
    seen,
    setup = false,
  }: {
    botIds: readonly string[]
    fallbackBotId?: string
    seen: ReadonlySet<string>
    setup?: boolean
  }
): ChatActivity {
  const latestUser = messages.findLastIndex(
    (message) => message.role === "user"
  )
  const target = messages[latestUser]?.metadata?.botId ?? fallbackBotId
  let botId = target
  let messageId: string | undefined
  let sectionIndex: number | undefined
  let parts: ChatUIMessage["parts"] = []
  for (const message of messages.slice(latestUser + 1)) {
    if (message.role !== "assistant") continue
    const sections = chatAuthorSections(message, botId)
    const last = sections.at(-1)!
    // A receipt-only message must not erase the response being rendered.
    if (
      last.parts.some(
        (part) =>
          part.type !== "data-messageSeen" && part.type !== "data-followUps"
      ) ||
      sections.length > 1
    ) {
      botId = last.botId
      messageId = message.id
      sectionIndex = sections.length - 1
      parts = last.parts
    } else if (!messageId) botId = last.botId
  }
  // Never attribute an unknown author to another teammate.
  const identity = {
    botId: botId && botIds.includes(botId) ? botId : undefined,
    messageId,
    sectionIndex,
  }
  if (status === "error") return { ...identity, state: "error" }
  const answered = new Set(
    messages
      .filter((message) => message.role === "user")
      .map((message) => message.metadata?.questionId)
  )
  if (
    parts.some(
      (part) =>
        part.type === "tool-askUser" &&
        part.state === "output-available" &&
        !answered.has(part.toolCallId)
    )
  )
    return { ...identity, state: "waiting" }

  const busy =
    status === "submitted" ||
    status === "streaming" ||
    (setup && latestUser === -1 && messages.length === 0)
  if (!busy) return { ...identity, state: "idle" }
  const evidence = parts.some(
    (part) => part.type !== "data-messageSeen" && part.type !== "data-followUps"
  )
  if (latestUser !== -1 && !seen.has(messages[latestUser].id) && !evidence)
    return { ...identity, state: "queued" }
  if (
    parts.some(
      (part) =>
        isToolUIPart(part) &&
        part.type !== "tool-askUser" &&
        (part.state === "input-streaming" || part.state === "input-available")
    )
  )
    return { ...identity, state: "working" }
  const latest = parts.findLast(
    (part) =>
      part.type === "text" ||
      part.type === "reasoning" ||
      part.type === "step-start" ||
      isToolUIPart(part)
  )
  if (latest?.type === "text" && latest.text.trim() && latest.state !== "done")
    return { ...identity, state: "responding" }
  return { ...identity, state: "thinking" }
}
