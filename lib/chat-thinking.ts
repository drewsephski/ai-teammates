import { isToolUIPart, type ChatStatus, type UIMessage } from "ai"

export function isChatThinking(
  messages: readonly UIMessage[],
  status: ChatStatus,
  setup: boolean,
  seen: ReadonlySet<string>
) {
  const latestUser = messages.findLastIndex(
    (message) => message.role === "user"
  )
  const responseStarted = messages.slice(latestUser + 1).some(
    (message) =>
      message.role === "assistant" &&
      message.parts.some((part) => {
        if (part.type === "text") return !!part.text.trim()
        if (part.type === "tool-askUser")
          return "state" in part && part.state === "output-available"
        return part.type !== "dynamic-tool" && isToolUIPart(part)
      })
  )
  const waiting =
    status === "submitted" ||
    status === "streaming" ||
    (setup && messages.length === 0 && status !== "error")
  // A submitted turn is still waiting to be read. Thinking starts only after
  // the agent acknowledges this specific prompt, never a previous one.
  const acknowledged = latestUser === -1 || seen.has(messages[latestUser].id)
  return waiting && acknowledged && !responseStarted
}
