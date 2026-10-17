// Pure rules for bringing your own model API key: the providers, how their
// model lists are read, and the errors a person sees. No database, SDK or
// Next.js import, so the browser, the schema and the tests can use it.

export const modelProviders = [
  "anthropic",
  "openai",
  "google",
  "openrouter",
] as const
export type ModelProvider = (typeof modelProviders)[number]

export const modelProviderLabels: Record<ModelProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google Gemini",
  openrouter: "OpenRouter",
}

// Where the person creates a key, shown next to the field
export const modelProviderKeyUrls: Record<ModelProvider, string> = {
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  google: "https://aistudio.google.com/apikey",
  openrouter: "https://openrouter.ai/keys",
}

export const MODEL_KEY_UNAVAILABLE_ERROR =
  "Saving your own API key isn't set up yet."
export const MODEL_KEY_REJECTED_ERROR =
  "That key was rejected. Check it and try again."
export const MODEL_NOT_OFFERED_ERROR = "Pick a model your key can use."
export const MODEL_KEY_MISSING_ERROR = "Save a key for that provider first."

export type ProviderModel = { id: string; name: string }

// The request that lists a provider's models, which also proves the key works
export function modelListRequest(
  provider: ModelProvider,
  apiKey: string
): { url: string; headers: Record<string, string>; keyCheckUrl?: string } {
  switch (provider) {
    case "anthropic":
      return {
        url: "https://api.anthropic.com/v1/models?limit=1000",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      }
    case "openai":
      return {
        url: "https://api.openai.com/v1/models",
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    case "google":
      return {
        url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
        headers: { "x-goog-api-key": apiKey },
      }
    case "openrouter":
      // The model list is public, so the key is checked on its own first
      return {
        url: "https://openrouter.ai/api/v1/models",
        headers: { Authorization: `Bearer ${apiKey}` },
        keyCheckUrl: "https://openrouter.ai/api/v1/key",
      }
  }
}

type Listed = {
  id?: unknown
  name?: unknown
  display_name?: unknown
  displayName?: unknown
  supportedGenerationMethods?: unknown
  supported_parameters?: unknown
}

const text = (value: unknown) => (typeof value === "string" ? value : "")

// OpenAI lists every model it serves; keep the ones that chat with tools
const openAIChat = /^(gpt-|o\d|chatgpt-)/
const openAINotChat =
  /(audio|realtime|tts|transcribe|image|search|embedding|moderation|instruct)/

// Chat models that can call tools, newest names first, from a model list
export function parseModelList(
  provider: ModelProvider,
  body: unknown
): ProviderModel[] {
  const record = (body ?? {}) as { data?: unknown; models?: unknown }
  const items = (
    Array.isArray(record.data)
      ? record.data
      : Array.isArray(record.models)
        ? record.models
        : []
  ) as Listed[]
  const models = items.flatMap((item): ProviderModel[] => {
    switch (provider) {
      case "anthropic": {
        const id = text(item.id)
        return id ? [{ id, name: text(item.display_name) || id }] : []
      }
      case "openai": {
        const id = text(item.id)
        return openAIChat.test(id) && !openAINotChat.test(id)
          ? [{ id, name: id }]
          : []
      }
      case "google": {
        const id = text(item.name).replace(/^models\//, "")
        const methods = Array.isArray(item.supportedGenerationMethods)
          ? item.supportedGenerationMethods
          : []
        return id.startsWith("gemini") && methods.includes("generateContent")
          ? [{ id, name: text(item.displayName) || id }]
          : []
      }
      case "openrouter": {
        const id = text(item.id)
        const params = Array.isArray(item.supported_parameters)
          ? item.supported_parameters
          : []
        return id && params.includes("tools")
          ? [{ id, name: text(item.name) || id }]
          : []
      }
    }
  })
  const seen = new Set<string>()
  return models
    .filter((model) => !seen.has(model.id) && !!seen.add(model.id))
    .sort((a, b) => b.id.localeCompare(a.id))
}

// The last four characters, so a person can tell their keys apart
export function keyHint(apiKey: string) {
  return apiKey.trim().slice(-4)
}

const notCharged = "Your Krafty AI allowance has not been charged."

// What a person sees when their own provider fails a reply. A failed call is
// never retried on Krafty's model: the person chose who pays.
export function ownModelErrorMessage(provider: ModelProvider, status?: number) {
  const label = modelProviderLabels[provider]
  if (status === 401 || status === 403)
    return `Your ${label} key was rejected. Update it in Usage. ${notCharged}`
  if (status === 402 || status === 429)
    return `${label} refused the request: your key is out of credit or rate limited. Check your ${label} account, or choose Krafty AI in Usage. ${notCharged}`
  if (status === 404)
    return `${label} doesn't offer the chosen model to your key. Pick another in Usage. ${notCharged}`
  return `${label} couldn't complete this reply. Try again, or choose Krafty AI in Usage. ${notCharged}`
}

// Every message ownModelErrorMessage can produce, for the agent's error filter
export function isOwnModelError(message: string) {
  return (
    message.endsWith(notCharged) &&
    modelProviders.some((provider) =>
      message.includes(modelProviderLabels[provider])
    )
  )
}
