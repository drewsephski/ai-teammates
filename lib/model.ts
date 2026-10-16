import { normalizeFailedToolCalls as normalizeToolReplay } from "@/lib/model-tool-replay"
import { neon } from "@neon/ai-sdk-provider"
import type { LanguageModelUsage, ModelMessage } from "ai"

type Model = ReturnType<typeof neon>
type CallOptions = Parameters<Model["doStream"]>[0]

const textModelId = "glm-5-3-flash"
const visionModelId = "gpt-5-6-luna"

// Keep the existing v3 provider's public prompt type while sharing replay repair
// with the native v4 OpenAI provider.
export function normalizeFailedToolCalls(prompt: CallOptions["prompt"]) {
  return normalizeToolReplay(prompt)
}

function hasImages(messages: readonly ModelMessage[]) {
  return messages.some((message) => {
    if (message.role === "user" && typeof message.content !== "string") {
      return message.content.some(
        (part) =>
          part.type === "image" ||
          (part.type === "file" && part.mediaType.startsWith("image/"))
      )
    }
    if (message.role !== "tool") return false
    return message.content.some(
      (part) =>
        part.type === "tool-result" &&
        part.output.type === "content" &&
        part.output.value.some(
          (item) => item.type === "file" && item.mediaType.startsWith("image/")
        )
    )
  })
}

// The person's latest message and everything since: the only images the model
// needs to see. Older screenshots stay in the transcript as placeholders, so a
// single screenshot doesn't move the rest of the chat to the vision model.
export function currentTurn<T extends { role: string }>(
  messages: readonly T[]
) {
  const start = messages.findLastIndex((message) => message.role === "user")
  return messages.slice(Math.max(0, start))
}

type Prompt = CallOptions["prompt"]
const EARLIER_IMAGE = "[An image from earlier in the chat, not shown here]"

// For the text model: images before the current turn become placeholders
export function withoutEarlierImages(prompt: Prompt): Prompt {
  const start = prompt.findLastIndex((message) => message.role === "user")
  return prompt.map((message, index) => {
    if (index >= start) return message
    if (message.role === "user")
      return {
        ...message,
        content: message.content.map((part) =>
          part.type === "file" && part.mediaType.startsWith("image/")
            ? { type: "text" as const, text: EARLIER_IMAGE }
            : part
        ),
      }
    if (message.role !== "tool") return message
    return {
      ...message,
      content: message.content.map((part) => {
        if (part.type !== "tool-result" || part.output.type !== "content")
          return part
        return {
          ...part,
          output: {
            ...part.output,
            value: part.output.value.map((item) =>
              (item.type === "file-data" || item.type === "image-data") &&
              item.mediaType.startsWith("image/")
                ? { type: "text" as const, text: EARLIER_IMAGE }
                : item
            ),
          },
        }
      }),
    }
  }) as Prompt
}

// AI SDK 7 gives this older provider file-data for tool screenshots.
// The native Responses route needs image-data to interpret them as images.
function withModelDefaults(options: CallOptions, vision: boolean): CallOptions {
  const provider = vision ? "openai" : "neon"
  return {
    ...options,
    providerOptions: {
      ...options.providerOptions,
      [provider]: {
        reasoningEffort: "low",
        ...options.providerOptions?.[provider],
      },
    },
    prompt: (vision
      ? normalizeFailedToolCalls(options.prompt)
      : withoutEarlierImages(normalizeFailedToolCalls(options.prompt))
    ).map((message) => {
      if (message.role !== "tool") return message
      return {
        ...message,
        content: message.content.map((part) => {
          if (part.type !== "tool-result" || part.output.type !== "content")
            return part
          return {
            ...part,
            output: {
              ...part.output,
              value: part.output.value.map((item) =>
                item.type === "file-data" && item.mediaType.startsWith("image/")
                  ? {
                      type: "image-data" as const,
                      data: item.data,
                      mediaType: item.mediaType,
                    }
                  : item
              ),
            },
          }
        }),
      }
    }),
  }
}

// GLM handles text and tools; Luna handles a step whose current turn has an
// image in it.
export function chatModel(messages: readonly ModelMessage[] = []): Model {
  const vision = hasImages(currentTurn(messages))
  const model = neon(vision ? visionModelId : textModelId)
  return {
    specificationVersion: model.specificationVersion,
    provider: model.provider,
    modelId: model.modelId,
    supportedUrls: model.supportedUrls,
    doGenerate: (options) =>
      model.doGenerate(withModelDefaults(options, vision)),
    doStream: (options) => model.doStream(withModelDefaults(options, vision)),
  }
}

// Recommendations only contain prose and always use the inexpensive text
// model, independently of the provider selected for the main conversation.
export function followUpModel(): Model {
  return chatModel()
}

// Dollars per million tokens, from https://neon.com/models.json.
function modelPricing(modelId: string, inputTokens: number) {
  switch (modelId) {
    case textModelId:
      return { input: 0.15, cachedInput: 0.03, cacheWrite: 0.15, output: 0.5 }
    case visionModelId:
      return inputTokens >= 272_000
        ? { input: 0.4, cachedInput: 0.04, cacheWrite: 0.5, output: 1.8 }
        : { input: 0.2, cachedInput: 0.02, cacheWrite: 0.25, output: 1.2 }
    default:
      throw new Error(`No usage pricing configured for model: ${modelId}`)
  }
}

// Calculate per request: Luna's context tier depends on that request's input.
export function chatModelCost(
  usage: LanguageModelUsage,
  modelId = textModelId
) {
  const inputTokens = usage.inputTokens ?? 0
  const cachedInputTokens = Math.min(
    inputTokens,
    usage.inputTokenDetails?.cacheReadTokens ?? 0
  )
  const cacheWriteTokens = Math.min(
    inputTokens - cachedInputTokens,
    usage.inputTokenDetails?.cacheWriteTokens ?? 0
  )
  const pricing = modelPricing(modelId, inputTokens)

  // Dollars per million tokens is millionths of a dollar per token.
  return Math.ceil(
    (inputTokens - cachedInputTokens - cacheWriteTokens) * pricing.input +
      cachedInputTokens * pricing.cachedInput +
      cacheWriteTokens * pricing.cacheWrite +
      (usage.outputTokens ?? 0) * pricing.output
  )
}
