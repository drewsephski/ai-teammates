import { apiRoute, readJson } from "@/lib/api"
import { forYouItemActionSchema } from "@/lib/for-you"
import { updateForYouItem } from "@/services/for-you"

type Context = { params: Promise<{ itemId: string }> }

// Dismiss a suggestion (with why), snooze it until tomorrow, or hide its app
// from For you (`hide_app`, newer builds only)
export const PATCH = apiRoute<Context>(
  async ({ userId }, request, { params }) => {
    const { itemId } = await params
    await updateForYouItem(
      userId,
      itemId,
      forYouItemActionSchema.parse(await readJson(request))
    )
  }
)
