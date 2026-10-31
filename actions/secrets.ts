"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import type { SecretSaveInput } from "@/db/schema"
import * as service from "@/services/secrets"

async function signedIn() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return userId
}

// From the key card in a chat (wakes the bot that asked) or from /workspace
export async function saveSecret(input: SecretSaveInput) {
  const saved = await service.saveSecret(await signedIn(), input)
  revalidatePath("/workspace")
  return saved
}

export async function deleteSecret(name: string) {
  await service.deleteSecret(await signedIn(), name)
  revalidatePath("/workspace")
}
