// Failed tool calls can retain the model's raw, malformed JSON in history.
// Keep the failure and call ID, but give the provider valid object arguments
// when replaying it. This never retries or executes the failed operation.
type ReplayPart = {
  type: string
  toolCallId?: string
  input?: unknown
  output?: { type: string }
}
type ReplayMessage = { role: string; content: string | ReplayPart[] }

export function normalizeFailedToolCalls<T extends ReplayMessage>(prompt: T[]): T[] {
  const failed = new Set(
    prompt.flatMap((message) =>
      message.role === "tool" && typeof message.content !== "string"
        ? message.content.flatMap((part) =>
            part.type === "tool-result" &&
            (part.output?.type === "error-text" ||
              part.output?.type === "error-json")
              ? [part.toolCallId]
              : []
          )
        : []
    )
  )
  if (failed.size === 0) return prompt

  return prompt.map((message): T => {
    if (message.role !== "assistant" || typeof message.content === "string") return message
    return {
      ...message,
      content: message.content.map((part) => {
        if (part.type !== "tool-call" || !failed.has(part.toolCallId))
          return part
        let input: unknown = part.input
        if (typeof input === "string") {
          try {
            input = JSON.parse(input)
          } catch {
            input = undefined
          }
        }
        return {
          ...part,
          input:
            input !== null && typeof input === "object" && !Array.isArray(input)
              ? input
              : {},
        }
      }),
    }
  })
}

