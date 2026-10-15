"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import type { AboutYou, MemorySettings, MemoryUpdate } from "@/db/schema"
import * as service from "@/services/memory"

async function signedIn() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return userId
}

export async function updateMemory(memoryId: string, input: MemoryUpdate) {
  const saved = await service.updateMemory(await signedIn(), memoryId, input)
  revalidatePath("/memory")
  return saved
}

export async function deleteMemory(memoryId: string) {
  const deleted = await service.deleteMemory(await signedIn(), memoryId)
  revalidatePath("/memory")
  return deleted
}

export async function updateMemorySettings(input: MemorySettings) {
  const row = await service.updateMemorySettings(await signedIn(), input)
  revalidatePath("/memory")
  return row
}

export async function saveAboutYou(input: AboutYou) {
  const values = await service.saveAboutYou(await signedIn(), input)
  revalidatePath("/memory")
  return values
}
