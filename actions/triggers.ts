"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import type { BotTriggerInsert, BotTriggerUpdate } from "@/db/schema"
import { publicOrigin } from "@/lib/api-response"
import {
  EMAIL_TRIGGERS_UNAVAILABLE_ERROR,
  PAID_TRIGGER_LIMIT_ERROR,
  TRIGGER_LIMIT_ERROR,
} from "@/lib/trigger-policy"
import * as service from "@/services/triggers"

async function signedIn() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return userId
}

const origin = async () => publicOrigin(await headers())

// Plan limits and a missing mail setup come back as data, so the form can
// explain them
export async function createTrigger(input: BotTriggerInsert) {
  try {
    const trigger = await service.createTrigger(
      await signedIn(),
      input,
      await origin()
    )
    revalidatePath("/activity")
    return { ok: true as const, trigger }
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (
      message === TRIGGER_LIMIT_ERROR ||
      message === PAID_TRIGGER_LIMIT_ERROR ||
      message === EMAIL_TRIGGERS_UNAVAILABLE_ERROR
    )
      return { ok: false as const, message }
    throw error
  }
}

export async function updateTrigger(
  triggerId: string,
  input: BotTriggerUpdate
) {
  const trigger = await service.updateTrigger(
    await signedIn(),
    triggerId,
    input,
    await origin()
  )
  revalidatePath("/activity")
  return trigger
}

export async function deleteTrigger(triggerId: string) {
  await service.deleteTrigger(await signedIn(), triggerId)
  revalidatePath("/activity")
}
