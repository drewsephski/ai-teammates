import { revalidatePath } from "next/cache"
import { z } from "zod"

import { apiRoute, readJson } from "@/lib/api"
import { startForYouTask } from "@/services/for-you"

const bodySchema = z.object({ token: z.string().min(1).max(10_000) })

// Accepts a suggestion's signed token and starts its chat
export const POST = apiRoute(async ({ userId }, request) => {
  const { token } = bodySchema.parse(await readJson(request))
  const result = await startForYouTask(userId, token)
  revalidatePath("/", "layout")
  return result
})
