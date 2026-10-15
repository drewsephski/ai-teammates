import { revalidatePath } from "next/cache"

import { aboutYouSchema } from "@/db/schema"
import { apiRoute, readJson } from "@/lib/api"
import { saveAboutYou } from "@/services/memory"

// Replaces every About you field; an empty field forgets that memory
export const PUT = apiRoute(async ({ userId }, request) => {
  const values = aboutYouSchema.parse(await readJson(request))
  const about = await saveAboutYou(userId, values)
  revalidatePath("/memory")
  return { about }
})
