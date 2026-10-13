import { isToolUIPart, type ChatStatus, type UIMessage } from "ai"

export function isChatThinking(
  messages: readonly UIMessage[],
  status: ChatStatus,
  setup: boolean
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
  return waiting && !responseStarted
}
