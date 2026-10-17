import type {
  AIProviderChoice,
  ModelCatalogRequest,
  ModelKeySave,
} from "@/db/schema"
import * as modelKeys from "@/lib/model-keys"
import { modelProviders, type ModelProvider } from "@/lib/model-key-policy"

// Own model keys are written once in lib/model-keys.ts, where the chat agent
// reads the selected one. These are the person's entry points.

export function listModelKeys(userId: string) {
  return modelKeys.listModelKeys(userId)
}

export function listProviderModels(userId: string, input: ModelCatalogRequest) {
  return modelKeys.listProviderModels(userId, input)
}

export function saveModelKey(userId: string, input: ModelKeySave) {
  return modelKeys.saveModelKey(userId, input)
}

export function selectAIProvider(userId: string, provider: AIProviderChoice) {
  return modelKeys.selectAIProvider(userId, provider)
}

// The provider comes from a URL segment, so an unknown one is a miss
export async function deleteModelKey(userId: string, provider: string) {
  if (!(modelProviders as readonly string[]).includes(provider))
    throw new Error("Key not found")
  return modelKeys.deleteModelKey(userId, provider as ModelProvider)
}
