import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"

import { secretSaveSchema } from "@/db/schema"
import { apiRoute, readJson } from "@/lib/api"
import { listSecrets, saveSecret } from "@/services/secrets"

// Names, labels and dates of the saved API keys, never their values
export const GET = apiRoute(async ({ userId }) => ({
  secrets: await listSecrets(userId),
}))

// Saves or replaces a key. From the key card in a chat (chatId, questionId and
// botId), it also wakes the bot that asked: `woke` and `inputSeq` say so.
export const POST = apiRoute(async ({ userId }, request) => {
  const input = secretSaveSchema.parse(await readJson(request))
  const saved = await saveSecret(userId, input)
  revalidatePath("/workspace")
  return NextResponse.json(saved, { status: 201 })
})
