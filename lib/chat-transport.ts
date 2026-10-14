import type { TriggerChatTransport } from "@trigger.dev/sdk/chat"
import type { ChatTransport } from "ai"
import type { ChatUIMessage } from "./sandbox-tools"

// useChat aborts on unmount. Trigger treats a send's abort signal as a backend
// Stop command, so leave cancellation to the reader and our explicit Stop button.
// Cancelling the reader still closes the SSE connection without stopping the task.
export function navigationChatTransport(
  transport: TriggerChatTransport
): ChatTransport<ChatUIMessage> {
  return {
    sendMessages: (options) =>
      transport.sendMessages({ ...options, abortSignal: undefined }),
    reconnectToStream: (options) => transport.reconnectToStream(options),
  }
}
