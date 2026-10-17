import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import * as Sentry from "@sentry/node"
import { wrapLanguageModel } from "ai"
import { and, eq } from "drizzle-orm"

import { db } from "@/db"
import {
  aiProviderSchema,
  chatgptConnections,
  modelCatalogSchema,
  modelKeySaveSchema,
  modelKeys,
  type AIProviderChoice,
  type ModelCatalogRequest,
  type ModelKeySave,
} from "@/db/schema"
import {
  credentialStorageReady,
  openCredential,
  sealCredential,
} from "@/lib/credential-crypto"
import {
  keyHint,
  MODEL_KEY_MISSING_ERROR,
  MODEL_KEY_REJECTED_ERROR,
  MODEL_KEY_UNAVAILABLE_ERROR,
  MODEL_NOT_OFFERED_ERROR,
  modelListRequest,
  modelProviderLabels,
  parseModelList,
  type ModelProvider,
} from "@/lib/model-key-policy"
import { normalizeFailedToolCalls } from "@/lib/model-tool-replay"

// Bring your own model: a person saves an API key for Anthropic, OpenAI,
// Google or OpenRouter and picks a model. While a key is selected, their
// bots' replies run on it and cost the Krafty allowance nothing. A failing
// key is never swapped for Krafty's model; the person chose who pays.

const keyContext = (userId: string, provider: ModelProvider) =>
  `model-key:${userId}:${provider}`

type Fetch = typeof fetch

// Lists the chat models a key can use. A rejected key is the person's to fix;
// anything else is the provider's failure, reported and worded as such.
export async function fetchProviderModels(
  provider: ModelProvider,
  apiKey: string,
  fetchImpl: Fetch = fetch
) {
  const request = modelListRequest(provider, apiKey)
  const get = (url: string) =>
    fetchImpl(url, {
      headers: request.headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    })
  const unreachable = (cause: unknown) => {
    Sentry.captureException(cause, { extra: { provider } })
    return new Error(
      `Couldn't reach ${modelProviderLabels[provider]}. Try again.`
    )
  }
  let response: Response
  try {
    if (request.keyCheckUrl) {
      const check = await get(request.keyCheckUrl)
      if (check.status === 401 || check.status === 403)
        throw new Error(MODEL_KEY_REJECTED_ERROR)
      if (!check.ok) throw new Error(`Key check failed (${check.status})`)
    }
    response = await get(request.url)
  } catch (error) {
    if (error instanceof Error && error.message === MODEL_KEY_REJECTED_ERROR)
      throw error
    throw unreachable(error)
  }
  if (
    response.status === 400 ||
    response.status === 401 ||
    response.status === 403
  )
    throw new Error(MODEL_KEY_REJECTED_ERROR)
  if (!response.ok)
    throw unreachable(new Error(`Model list failed (${response.status})`))
  return parseModelList(provider, await response.json().catch(() => ({})))
}

// The language model for a key. Replayed tool calls are repaired the same way
// as on Krafty's model, so a failed call from an earlier turn doesn't break
// the next request.
export function createOwnModel(
  provider: ModelProvider,
  modelId: string,
  apiKey: string
) {
  const model = (() => {
    switch (provider) {
      case "anthropic":
        return createAnthropic({ apiKey })(modelId)
      case "openai":
        return createOpenAI({ apiKey })(modelId)
      case "google":
        return createGoogleGenerativeAI({ apiKey })(modelId)
      case "openrouter":
        return createOpenAICompatible({
          name: "openrouter",
          baseURL: "https://openrouter.ai/api/v1",
          apiKey,
        }).chatModel(modelId)
    }
  })()
  return wrapLanguageModel({
    model,
    middleware: {
      transformParams: async ({ params }) => ({
        ...params,
        prompt: normalizeFailedToolCalls(params.prompt),
      }),
    },
  })
}

export async function selectedModelKey(userId: string) {
  const [row] = await db
    .select()
    .from(modelKeys)
    .where(and(eq(modelKeys.userId, userId), eq(modelKeys.selected, true)))
    .limit(1)
  return row
}

// The selected key's model, or undefined when replies use Krafty's model
export async function ownModelForUser(userId: string) {
  const row = await selectedModelKey(userId)
  if (!row) return undefined
  return {
    provider: row.provider,
    model: createOwnModel(
      row.provider,
      row.model,
      openCredential(row.apiKey, keyContext(userId, row.provider))
    ),
  }
}

export async function listModelKeys(userId: string) {
  const rows = await db
    .select({
      provider: modelKeys.provider,
      keyHint: modelKeys.keyHint,
      model: modelKeys.model,
      selected: modelKeys.selected,
      updatedAt: modelKeys.updatedAt,
    })
    .from(modelKeys)
    .where(eq(modelKeys.userId, userId))
    .orderBy(modelKeys.provider)
  return rows
}
export type PublicModelKey = Awaited<ReturnType<typeof listModelKeys>>[number]

// The models a key can use: a pasted key, or the saved one when none is given
export async function listProviderModels(
  userId: string,
  input: ModelCatalogRequest,
  fetchImpl: Fetch = fetch
) {
  const { provider, apiKey } = modelCatalogSchema.parse(input)
  return fetchProviderModels(
    provider,
    apiKey ?? (await savedKey(userId, provider)),
    fetchImpl
  )
}

async function savedKey(userId: string, provider: ModelProvider) {
  const [row] = await db
    .select({ apiKey: modelKeys.apiKey })
    .from(modelKeys)
    .where(and(eq(modelKeys.userId, userId), eq(modelKeys.provider, provider)))
  if (!row) throw new Error(MODEL_KEY_MISSING_ERROR)
  return openCredential(row.apiKey, keyContext(userId, provider))
}

// Saves a key (or a new model for a saved one) after checking the key works
// and offers the model, then selects it so the next reply uses it
export async function saveModelKey(
  userId: string,
  input: ModelKeySave,
  fetchImpl: Fetch = fetch
) {
  if (!credentialStorageReady()) throw new Error(MODEL_KEY_UNAVAILABLE_ERROR)
  const values = modelKeySaveSchema.parse(input)
  const apiKey = values.apiKey ?? (await savedKey(userId, values.provider))
  const models = await fetchProviderModels(values.provider, apiKey, fetchImpl)
  if (!models.some((model) => model.id === values.model))
    throw new Error(MODEL_NOT_OFFERED_ERROR)
  const sealed = {
    apiKey: sealCredential(apiKey, keyContext(userId, values.provider)),
    keyHint: keyHint(apiKey),
    model: values.model,
    updatedAt: new Date(),
  }
  await db
    .insert(modelKeys)
    .values({ userId, provider: values.provider, ...sealed })
    .onConflictDoUpdate({
      target: [modelKeys.userId, modelKeys.provider],
      set: sealed,
    })
  await selectAIProvider(userId, values.provider)
  return listModelKeys(userId)
}

// Who pays for replies from now on. One choice at a time: picking a key
// turns ChatGPT plan usage off, and Krafty turns both off.
export async function selectAIProvider(
  userId: string,
  choice: AIProviderChoice
) {
  const { provider } = aiProviderSchema.parse({ provider: choice })
  await db.transaction(async (tx) => {
    if (provider !== "krafty") {
      const [row] = await tx
        .select({ provider: modelKeys.provider })
        .from(modelKeys)
        .where(
          and(eq(modelKeys.userId, userId), eq(modelKeys.provider, provider))
        )
      if (!row) throw new Error(MODEL_KEY_MISSING_ERROR)
    }
    await tx
      .update(modelKeys)
      .set({ selected: false })
      .where(eq(modelKeys.userId, userId))
    if (provider !== "krafty")
      await tx
        .update(modelKeys)
        .set({ selected: true })
        .where(
          and(eq(modelKeys.userId, userId), eq(modelKeys.provider, provider))
        )
    await tx
      .update(chatgptConnections)
      .set({ enabled: false, updatedAt: new Date() })
      .where(
        and(
          eq(chatgptConnections.userId, userId),
          eq(chatgptConnections.enabled, true)
        )
      )
  })
  return listModelKeys(userId)
}

// Picking ChatGPT plan usage deselects every key
export async function deselectModelKeys(userId: string) {
  await db
    .update(modelKeys)
    .set({ selected: false })
    .where(eq(modelKeys.userId, userId))
}

export async function deleteModelKey(userId: string, provider: ModelProvider) {
  const [row] = await db
    .delete(modelKeys)
    .where(and(eq(modelKeys.userId, userId), eq(modelKeys.provider, provider)))
    .returning({ provider: modelKeys.provider })
  if (!row) throw new Error("Key not found")
  return listModelKeys(userId)
}
