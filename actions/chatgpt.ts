"use server"

import { auth } from "@clerk/nextjs/server"
import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { db } from "@/db"
import {
  chatgptConnections,
  chatgptPreferenceSchema,
  type ChatGPTPreference,
} from "@/db/schema"
import { CHATGPT_ISSUER, requireChatGPTConfig } from "@/lib/chatgpt-config"
import { disconnectChatGPT, getChatGPTStatus } from "@/lib/chatgpt-connection"
import { getChatGPTModels } from "@/lib/chatgpt-model"
import { deselectModelKeys } from "@/lib/model-keys"
import {
  CHATGPT_RECONNECT_ERROR,
  hasChatGPTPlanGrant,
} from "@/lib/chatgpt-policy"

export async function listChatGPTModels() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return getChatGPTModels(userId)
}

export async function saveChatGPTPreference(input: ChatGPTPreference) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  const values = chatgptPreferenceSchema.parse(input)
  const config = values.enabled ? requireChatGPTConfig() : null
  if (values.enabled) {
    const models = await getChatGPTModels(userId)
    if (
      !models.length ||
      (values.model && !models.some((model) => model.id === values.model))
    )
      throw new Error("Choose an available ChatGPT model.")
  }
  const connection = await db.query.chatgptConnections.findFirst({
    where: eq(chatgptConnections.userId, userId),
  })
  if (
    !connection ||
    (values.enabled &&
      (!config ||
        connection.clientId !== config.clientId ||
        connection.issuer !== CHATGPT_ISSUER ||
        !config.planUsageEnabled ||
        !hasChatGPTPlanGrant(connection.scopes)))
  )
    throw new Error(CHATGPT_RECONNECT_ERROR)
  const [saved] = await db
    .update(chatgptConnections)
    .set({ ...values, updatedAt: new Date() })
    .where(
      and(
        eq(chatgptConnections.userId, userId),
        eq(chatgptConnections.updatedAt, connection.updatedAt)
      )
    )
    .returning({ userId: chatgptConnections.userId })
  if (!saved) throw new Error("Your connection changed. Refresh and try again.")
  // One provider at a time: the ChatGPT plan replaces a selected API key
  if (values.enabled) await deselectModelKeys(userId)
  revalidatePath("/", "layout")
  return getChatGPTStatus(userId)
}

export async function disconnectChatGPTPlan() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  const result = await disconnectChatGPT(userId)
  revalidatePath("/", "layout")
  return result
}
