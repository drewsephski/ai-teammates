import { eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { chatgptConnections } from "@/db/schema"
import { CHATGPT_RESOURCE } from "@/lib/chatgpt-config"
import { createChatGPTModel } from "@/lib/chatgpt-provider"
import { getChatGPTAccessToken } from "@/lib/chatgpt-connection"
import {
  CHATGPT_REQUEST_ERROR,
  chatGPTErrorMessage,
} from "@/lib/chatgpt-policy"

const catalogSchema = z.object({
  models: z.array(
    z.object({
      slug: z.string().min(1).max(200),
      display_name: z.string(),
      visibility: z.string(),
    })
  ),
})
export type ChatGPTModelChoice = { id: string; name: string }

export async function getChatGPTModels(
  userId: string,
  requireSelected = false
): Promise<ChatGPTModelChoice[]> {
  const token = await getChatGPTAccessToken(userId, requireSelected)
  let response: Response
  try {
    response = await fetch(`${CHATGPT_RESOURCE}/models`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new Error(CHATGPT_REQUEST_ERROR)
  }
  if (!response.ok) throw new Error(chatGPTErrorMessage(response.status))
  const parsed = catalogSchema.safeParse(await response.json())
  if (!parsed.success) throw new Error(CHATGPT_REQUEST_ERROR)
  return parsed.data.models
    .filter((model) => model.visibility === "list")
    .map((model) => ({ id: model.slug, name: model.display_name }))
}

export async function chatGPTModelForUser(userId: string) {
  const [models, connection] = await Promise.all([
    getChatGPTModels(userId, true),
    db.query.chatgptConnections.findFirst({
      where: eq(chatgptConnections.userId, userId),
      columns: { model: true },
    }),
  ])
  const model = connection?.model
    ? models.find((model) => model.id === connection.model)
    : models[0]
  if (!model)
    throw new Error(
      "Choose an available ChatGPT model in Usage. Your Krafty AI allowance has not been charged."
    )
  return createChatGPTModel(model.id, () => getChatGPTAccessToken(userId))
}
