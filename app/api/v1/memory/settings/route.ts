import { revalidatePath } from "next/cache"

import { memorySettingsSchema } from "@/db/schema"
import { apiRoute, readJson } from "@/lib/api"
import { updateMemorySettings } from "@/services/memory"

export const PUT = apiRoute(async ({ userId }, request) => {
  const values = memorySettingsSchema.parse(await readJson(request))
  const row = await updateMemorySettings(userId, values)
  revalidatePath("/memory")
  return { memoryEnabled: row.memoryEnabled }
})
