import { z } from "zod"

import { apiRoute, readJson } from "@/lib/api"
import { updateForYouItem } from "@/services/for-you"

type Context = { params: Promise<{ itemId: string }> }

const bodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("dismiss"),
    reason: z.enum(["not_relevant", "done", "wrong_bot"]),
  }),
  z.object({ type: z.literal("snooze") }),
])

// Dismiss a suggestion (with why), or snooze it until tomorrow
export const PATCH = apiRoute<Context>(
  async ({ userId }, request, { params }) => {
    const { itemId } = await params
    await updateForYouItem(
      userId,
      itemId,
      bodySchema.parse(await readJson(request))
    )
  }
)
