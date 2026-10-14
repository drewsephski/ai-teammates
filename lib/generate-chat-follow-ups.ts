import { streamText, type LanguageModel, type LanguageModelUsage } from "ai"
import {
  followUpContext,
  followUpInstructions,
  parseFollowUps,
} from "@/lib/chat-follow-ups"
import type { ChatUIMessage } from "@/lib/sandbox-tools"

// This is a separate, tool-free suggestion call, not the managed chat turn.
// Streaming also supports the user's streaming-only ChatGPT connection.
export async function generateChatFollowUps({
  model,
  messages,
  profile,
  signal,
  onUsage,
}: {
  model: LanguageModel
  messages: ChatUIMessage[]
  profile: string
  signal: AbortSignal
  onUsage: (usage: LanguageModelUsage) => Promise<void>
}) {
  const result = streamText({
    model,
    system: followUpInstructions,
    prompt: JSON.stringify({
      teammate: profile.slice(0, 3000),
      conversation: followUpContext(messages),
    }),
    maxOutputTokens: 500,
    maxRetries: 0,
    abortSignal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    onStepEnd: async ({ usage }) => onUsage(usage),
  })
  const text = await result.text
  if ((await result.finishReason) !== "stop") return []
  try {
    return parseFollowUps(JSON.parse(text))
  } catch {
    return []
  }
}
