"use server"

import { auth, currentUser } from "@clerk/nextjs/server"
import type { ChatStartSessionParams } from "@trigger.dev/sdk/ai"
import { revalidatePath } from "next/cache"

import type { GroupChatInsert } from "@/db/schema"
import type { chatAgent } from "@/trigger/chat"
import * as service from "@/services/chats"

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

export async function getDesktopUrl(chatId: string) {
  return service.getDesktopUrl(await caller(), chatId)
}

export async function getComputerInUse(chatId: string) {
  const { userId } = await caller()
  return service.getComputerInUse(userId, chatId)
}

export async function resetDesktop(chatId: string) {
  await service.resetDesktop(await caller(), chatId)
  revalidatePath("/", "layout")
}

export async function pauseDesktop(chatId: string) {
  const { userId } = await caller()
  await service.pauseDesktop(userId, chatId)
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
