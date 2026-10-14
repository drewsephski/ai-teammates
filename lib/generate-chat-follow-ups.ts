import {
  Output,
  streamText,
  type LanguageModel,
  type LanguageModelUsage,
} from "ai"
import {
  followUpContext,
  followUpInstructions,
  followUpsSchema,
  parseFollowUps,
} from "@/lib/chat-follow-ups"
import type { ChatUIMessage } from "@/lib/sandbox-tools"
import { followUpModel } from "@/lib/model"

// This is a separate, tool-free suggestion call, not the managed chat turn.
// Keep the model injectable for tests; production always uses GLM 5.3 Flash.
export async function generateChatFollowUps({
  model = followUpModel(),
  messages,
  profile,
  signal,
  onUsage,
}: {
  model?: LanguageModel
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
    // The limit includes reasoning tokens, not just the short JSON response.
    maxOutputTokens: 1500,
    output: Output.object({ schema: followUpsSchema }),
    maxRetries: 0,
    abortSignal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    onStepEnd: async ({ usage }) => onUsage(usage),
  })
  await result.text
  const finishReason = await result.finishReason
  if (finishReason !== "stop")
    throw new Error(`Follow-up generation ended with ${finishReason}`)
  // Let the caller report invalid output instead of silently hiding failures.
  return parseFollowUps(await result.output)
}
