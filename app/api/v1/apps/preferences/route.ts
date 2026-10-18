import { revalidatePath } from "next/cache"

import { apiRoute, readJson } from "@/lib/api"
import { appSuggestionsSchema } from "@/lib/for-you"
import { setAppSuggestions } from "@/services/for-you"

// Turns For you suggestions from one app on or off: { toolkit, proactive }
export const PATCH = apiRoute(async ({ userId }, request) => {
  const input = appSuggestionsSchema.parse(await readJson(request))
  const result = await setAppSuggestions(userId, input.toolkit, input.proactive)
  revalidatePath("/workspace")
  return result
})
