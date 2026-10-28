import { normalizeFailedToolCalls as normalizeToolReplay } from "@/lib/model-tool-replay"
import { anthropic } from "@ai-sdk/anthropic"
import { neon } from "@neon/ai-sdk-provider"
import * as Sentry from "@sentry/node"
import {
  APICallError,
  wrapLanguageModel,
  type LanguageModelUsage,
  type ModelMessage,
} from "ai"

type GatewayModel = ReturnType<typeof neon>
type CallOptions = Parameters<GatewayModel["doStream"]>[0]
type Model = ReturnType<typeof wrapLanguageModel>
type ModelCallOptions = Parameters<Model["doStream"]>[0]
type ModelStream = Awaited<ReturnType<Model["doStream"]>>
type StreamPart =
  ModelStream["stream"] extends ReadableStream<infer T> ? T : never

// Anthropic, on the app's ANTHROPIC_API_KEY, answers first for an account
// that accepted AI permission v3 or later (lib/ai-consent.ts); the Neon AI
// Gateway answers otherwise, or when Anthropic fails the call.
const claudeModelId = "claude-haiku-5-5"
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

const EARLIER_IMAGE = "[An image from earlier in the chat, not shown here]"

type PromptPart = {
  type: string
  mediaType?: string
  output?: { type: string; value?: PromptPart[] }
}

// Images are user `file` parts, and tool screenshots are `file-data` or
// `image-data` for the gateway's older provider and `file` for Anthropic's.
function isImage(part: PromptPart) {
  return (
    ["file", "file-data", "image-data"].includes(part.type) &&
    !!part.mediaType?.startsWith("image/")
  )
}

// Images before the current turn become placeholders
export function withoutEarlierImages<P extends readonly { role: string }[]>(
  prompt: P
): P {
  const start = prompt.findLastIndex((message) => message.role === "user")
  return prompt.map((message, index) => {
    const content = (message as { content?: unknown }).content
    if (index >= start || !Array.isArray(content)) return message
    if (message.role === "user")
      return {
        ...message,
        content: (content as PromptPart[]).map((part) =>
          isImage(part) ? { type: "text", text: EARLIER_IMAGE } : part
        ),
      }
    if (message.role !== "tool") return message
    return {
      ...message,
      content: (content as PromptPart[]).map((part) => {
        if (part.type !== "tool-result" || part.output?.type !== "content")
          return part
        return {
          ...part,
          output: {
            ...part.output,
            value: part.output.value?.map((item) =>
              isImage(item) ? { type: "text", text: EARLIER_IMAGE } : item
            ),
          },
        }
      }),
    }
  }) as unknown as P
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
function gatewayModel(messages: readonly ModelMessage[]): Model {
  const vision = hasImages(currentTurn(messages))
  const model = neon(vision ? visionModelId : textModelId)
  const gateway: GatewayModel = {
    specificationVersion: model.specificationVersion,
    provider: model.provider,
    modelId: model.modelId,
    supportedUrls: model.supportedUrls,
    doGenerate: (options) =>
      model.doGenerate(withModelDefaults(options, vision)),
    doStream: (options) => model.doStream(withModelDefaults(options, vision)),
  }
  // Lifts the gateway's older provider to the interface Anthropic's uses
  return wrapLanguageModel({ model: gateway, middleware: [] })
}

// Haiku reads images itself, so one model covers text and screenshots. The
// system prompt changes every turn (memory, clock, handoffs), so a replayed
// thinking block from an earlier turn is dropped instead of failing the call.
function withClaudeDefaults(options: ModelCallOptions): ModelCallOptions {
  return {
    ...options,
    providerOptions: {
      ...options.providerOptions,
      anthropic: {
        effort: "low",
        thinking: {
          type: "adaptive",
          blockBinding: { prefixMismatchBehavior: "drop_block" },
        },
        // Anthropic caches only when asked; each step re-reads the turn so far
        cacheControl: { type: "ephemeral" },
        ...options.providerOptions?.anthropic,
      },
    },
    prompt: withoutEarlierImages(normalizeToolReplay(options.prompt)),
  }
}

function claudeModel(): Model {
  const model = anthropic(claudeModelId)
  return {
    specificationVersion: model.specificationVersion,
    provider: model.provider,
    modelId: model.modelId,
    supportedUrls: model.supportedUrls,
    doGenerate: (options) => model.doGenerate(withClaudeDefaults(options)),
    doStream: (options) => model.doStream(withClaudeDefaults(options)),
  }
}

// Anthropic can fail after answering 200 (overloaded, for one): read up to the
// first output so that error still reaches the fallback.
async function started(result: ModelStream): Promise<ModelStream> {
  const reader = result.stream.getReader()
  const opening: StreamPart[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value.type === "error") {
      reader.cancel().catch(() => {})
      throw value.error
    }
    opening.push(value)
    if (!["stream-start", "response-metadata", "raw"].includes(value.type))
      break
  }
  return {
    ...result,
    stream: new ReadableStream({
      start(controller) {
        for (const part of opening) controller.enqueue(part)
      },
      async pull(controller) {
        const { done, value } = await reader.read()
        if (done) controller.close()
        else controller.enqueue(value)
      },
      cancel: (reason) => reader.cancel(reason),
    }),
  }
}

// A call the primary fails before any output goes to the fallback. modelId
// names the model that served the latest call, because the AI SDK reads it
// when the step ends and chatModelCost prices the step by it.
export function withFallback(
  primary: Model,
  fallback: Model,
  onFallback: (error: unknown) => void
): Model {
  let served = primary
  async function call<T>(
    signal: AbortSignal | undefined,
    run: (model: Model) => PromiseLike<T>
  ) {
    served = primary
    try {
      return await run(primary)
    } catch (error) {
      if (signal?.aborted) throw error
      onFallback(error)
      served = fallback
      return run(fallback)
    }
  }
  return {
    specificationVersion: "v4",
    get provider() {
      return served.provider
    },
    get modelId() {
      return served.modelId
    },
    // Files arrive as data, so either model can take a call the other failed
    supportedUrls: {},
    doGenerate: (options) =>
      call(options.abortSignal, (model) => model.doGenerate(options)),
    doStream: (options) =>
      call(options.abortSignal, async (model) =>
        model === primary
          ? started(await model.doStream(options))
          : model.doStream(options)
      ),
  }
}

function reportFallback(error: unknown) {
  Sentry.logger.warn("Anthropic unavailable; using Neon AI Gateway", {
    "error.type": error instanceof Error ? error.name : "UnknownError",
    ...(APICallError.isInstance(error) &&
      error.statusCode && { "http.status_code": error.statusCode }),
  })
}

export type ChatModelOptions = {
  // The account accepted an AI permission that names Anthropic, read with
  // anthropicAllowed (lib/ai-consent-store.ts). Off unless a caller says so.
  anthropic?: boolean
}

// Every app-funded call: Claude Haiku when ANTHROPIC_API_KEY is set and the
// account allows Anthropic, with the Neon AI Gateway as the fallback;
// otherwise the gateway alone.
export function chatModel(
  messages: readonly ModelMessage[] = [],
  { anthropic = false }: ChatModelOptions = {}
): Model {
  const gateway = gatewayModel(messages)
  if (!anthropic || !process.env.ANTHROPIC_API_KEY?.trim()) return gateway
  return withFallback(claudeModel(), gateway, reportFallback)
}

// Recommendations only contain prose and always use the app's own models,
// independently of the provider selected for the main conversation.
export function followUpModel(options: ChatModelOptions = {}): Model {
  return chatModel([], options)
}

// Dollars per million tokens: Claude's from Anthropic's pricing (cache reads
// 0.1x input, five-minute cache writes 1.25x, a higher tier above 100K input
// tokens), the gateway models' from https://neon.com/models.json.
function modelPricing(modelId: string, inputTokens: number) {
  switch (modelId) {
    case claudeModelId:
      return inputTokens > 100_000
        ? { input: 0.5, cachedInput: 0.05, cacheWrite: 0.625, output: 2.5 }
        : { input: 0.1, cachedInput: 0.01, cacheWrite: 0.125, output: 0.5 }
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

// Calculate per request: Luna's and Claude's tiers depend on that request's input.
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

// The most a call could cost on whichever of the app's models serves it, for
// budget checks made before the call
export function chatModelBound(usage: LanguageModelUsage) {
  return Math.max(
    ...[claudeModelId, textModelId, visionModelId].map((modelId) =>
      chatModelCost(usage, modelId)
    )
  )
}
