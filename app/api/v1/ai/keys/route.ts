import { revalidatePath } from "next/cache"

import { modelKeySaveSchema } from "@/db/schema"
import { apiRoute, readJson } from "@/lib/api"
import { listModelKeys, saveModelKey } from "@/services/model-keys"

// Saved keys never include the key itself, only its last four characters
export const GET = apiRoute(async ({ userId }) => ({
  keys: await listModelKeys(userId),
}))

// Checks the key against the provider, saves it and selects it. Leave apiKey
// out to change the model of a saved key.
export const PUT = apiRoute(async ({ userId }, request) => {
  const input = modelKeySaveSchema.parse(await readJson(request))
  const keys = await saveModelKey(userId, input)
  revalidatePath("/usage")
  return { keys }
})
