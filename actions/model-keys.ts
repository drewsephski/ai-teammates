"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import type {
  AIProviderChoice,
  ModelCatalogRequest,
  ModelKeySave,
} from "@/db/schema"
import {
  MODEL_KEY_MISSING_ERROR,
  MODEL_KEY_REJECTED_ERROR,
  MODEL_KEY_UNAVAILABLE_ERROR,
  MODEL_NOT_OFFERED_ERROR,
} from "@/lib/model-key-policy"
import * as service from "@/services/model-keys"

async function signedIn() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return userId
}

// Production hides thrown messages, so the ones the form explains come back
// as data: a rejected key, a model it can't use, an unreachable provider
const explained = (error: unknown) => {
  const message = error instanceof Error ? error.message : ""
  if (
    [
      MODEL_KEY_MISSING_ERROR,
      MODEL_KEY_REJECTED_ERROR,
      MODEL_KEY_UNAVAILABLE_ERROR,
      MODEL_NOT_OFFERED_ERROR,
    ].includes(message) ||
    /^Couldn't reach /.test(message)
  )
    return { ok: false as const, message }
  throw error
}

export async function listProviderModels(input: ModelCatalogRequest) {
  try {
    const models = await service.listProviderModels(await signedIn(), input)
    return { ok: true as const, models }
  } catch (error) {
    return explained(error)
  }
}

export async function saveModelKey(input: ModelKeySave) {
  try {
    const keys = await service.saveModelKey(await signedIn(), input)
    revalidatePath("/usage")
    return { ok: true as const, keys }
  } catch (error) {
    return explained(error)
  }
}

export async function selectAIProvider(provider: AIProviderChoice) {
  const keys = await service.selectAIProvider(await signedIn(), provider)
  // The chat's usage notice depends on who pays
  revalidatePath("/", "layout")
  return keys
}

export async function deleteModelKey(provider: string) {
  const keys = await service.deleteModelKey(await signedIn(), provider)
  revalidatePath("/", "layout")
  return keys
}
