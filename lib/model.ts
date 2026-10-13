import { neon } from "@neon/ai-sdk-provider"
import type { LanguageModelUsage, ModelMessage } from "ai"

type Model = ReturnType<typeof neon>
type CallOptions = Parameters<Model["doStream"]>[0]

const textModelId = "glm-5-3-flash"
const visionModelId = "gpt-5-6-luna"

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
    prompt: options.prompt.map((message) => {
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

// GLM handles text and tools; Luna handles any step with image context.
export function chatModel(messages: readonly ModelMessage[] = []): Model {
  const vision = hasImages(messages)
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
