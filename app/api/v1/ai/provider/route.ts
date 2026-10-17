import { revalidatePath } from "next/cache"

import { aiProviderSchema } from "@/db/schema"
import { apiRoute, readJson } from "@/lib/api"
import { selectAIProvider } from "@/services/model-keys"

// { provider: "krafty" } goes back to the Krafty allowance; a provider name
// picks that saved key. ChatGPT plan usage has its own preference.
export const PUT = apiRoute(async ({ userId }, request) => {
  const { provider } = aiProviderSchema.parse(await readJson(request))
  const keys = await selectAIProvider(userId, provider)
  revalidatePath("/", "layout")
  return { keys }
})
