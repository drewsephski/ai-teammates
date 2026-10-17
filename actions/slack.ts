"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import type { SlackSettings } from "@/db/schema"
import * as service from "@/services/slack"

async function signedIn() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return userId
}

export async function updateSlackSettings(input: SlackSettings) {
  const status = await service.updateSlackSettings(await signedIn(), input)
  revalidatePath("/activity")
  return status
}

export async function disconnectSlack() {
  const status = await service.disconnectSlack(await signedIn())
  revalidatePath("/activity")
  return status
}
