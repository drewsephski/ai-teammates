import { revalidatePath } from "next/cache"
import { z } from "zod"

import { apiRoute, readJson } from "@/lib/api"
import { startForYouItem } from "@/services/for-you"

// `token` is the field name older app builds send; it carries the item ID
const bodySchema = z
  .object({
    itemId: z.string().min(1).max(64).optional(),
    token: z.string().min(1).max(64).optional(),
  })
  .refine((body) => body.itemId ?? body.token, "itemId is required")

// Starts a suggestion's chat; repeating it returns the same chat
export const POST = apiRoute(async ({ userId }, request) => {
  const body = bodySchema.parse(await readJson(request))
  const result = await startForYouItem(userId, (body.itemId ?? body.token)!)
  revalidatePath("/", "layout")
  return result
})
