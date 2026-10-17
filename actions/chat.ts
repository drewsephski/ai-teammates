"use server"

import { auth, currentUser } from "@clerk/nextjs/server"
import type { ChatStartSessionParams } from "@trigger.dev/sdk/ai"
import { revalidatePath } from "next/cache"

import type { GroupChatInsert } from "@/db/schema"
import {
  COMPUTER_TIME_USED_UP_ERRORS,
  COMPUTERS_BUSY_ERROR,
  SANDBOX_BUSY_ERROR,
  computerTimeUsedUpMessage,
  isProviderCapacityError,
} from "@/lib/sandbox-policy"
import type { chatAgent } from "@/trigger/chat"
import * as service from "@/services/chats"
import { getUsageSummary } from "@/services/usage"

async function caller() {
  const { isAuthenticated, userId, has } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return { userId, has }
}

export async function startChatSession(
  params: ChatStartSessionParams<typeof chatAgent>
) {
  return service.startChatSession(
    await caller(),
    params,
    async () => (await currentUser())?.firstName
  )
}

export async function mintChatAccessToken(chatId: string) {
  return service.mintChatAccessToken(await caller(), chatId)
}

export async function loadTranscript(params: { chatId: string }) {
  const { userId } = await caller()
  return service.loadTranscript(userId, params.chatId)
}

// Why a computer request didn't go ahead. Production hides the text of an
// error thrown from a server action, so these come back as data.
export type DesktopFailure = {
  ok: false
  reason: "usage" | "capacity" | "busy"
  message: string
}

function desktopFailure(error: unknown): DesktopFailure | undefined {
  const message = error instanceof Error ? error.message : ""
  if (
    message === "Usage limit reached" ||
    (COMPUTER_TIME_USED_UP_ERRORS as readonly string[]).includes(message)
  )
    return {
      ok: false,
      reason: "usage",
      message:
        message === "Usage limit reached"
          ? computerTimeUsedUpMessage()
          : message,
    }
  if (message === COMPUTERS_BUSY_ERROR || isProviderCapacityError(error))
    return { ok: false, reason: "capacity", message: COMPUTERS_BUSY_ERROR }
  if (message === SANDBOX_BUSY_ERROR)
    return { ok: false, reason: "busy", message: SANDBOX_BUSY_ERROR }
}

async function desktopOutcome<T extends object>(run: () => Promise<T>) {
  try {
    return { ok: true as const, ...(await run()) }
  } catch (error) {
    const failure = desktopFailure(error)
    if (failure) return failure
    throw error
  }
}

export async function getDesktopUrl(chatId: string) {
  const who = await caller()
  return desktopOutcome(() => service.getDesktopUrl(who, chatId))
}

export async function getComputerInUse(chatId: string) {
  const { userId } = await caller()
  return service.getComputerInUse(userId, chatId)
}

// What the screen shows beside the computer: the plan and the time left
export async function getComputerTime() {
  const { userId } = await caller()
  const { tier, remaining } = await getUsageSummary(userId)
  return { tier, remainingSeconds: Math.max(0, remaining.sandbox) }
}

export async function resetDesktop(chatId: string) {
  const who = await caller()
  const result = await desktopOutcome(async () => {
    await service.resetDesktop(who, chatId)
    return {}
  })
  if (result.ok) revalidatePath("/", "layout")
  return result
}

export async function pauseDesktop(chatId: string) {
  const { userId } = await caller()
  return desktopOutcome(async () => {
    await service.pauseDesktop(userId, chatId)
    return {}
  })
}

export async function createGroupChat(values: GroupChatInsert) {
  const { userId } = await caller()
  const chat = await service.createGroupChat(userId, values)
  revalidatePath("/", "layout")
  return chat
}

export async function updateGroupChat(chatId: string, values: GroupChatInsert) {
  const { userId } = await caller()
  const chat = await service.updateGroupChat(userId, chatId, values)
  revalidatePath("/", "layout")
  return chat
}

export async function deleteGroupChat(chatId: string) {
  const { userId } = await caller()
  await service.deleteGroupChat(userId, chatId)
  revalidatePath("/", "layout")
}
