import { revalidatePath } from "next/cache"

import { morningSummarySchema } from "@/db/schema"
import { apiRoute, readJson } from "@/lib/api"
import { getMorningSummary, updateMorningSummary } from "@/services/activity"

// The morning summary push: whether it's on, and whether a timezone is set
export const GET = apiRoute(async ({ userId }) => ({
  morningSummary: await getMorningSummary(userId),
}))

export const PUT = apiRoute(async ({ userId }, request) => {
  const values = morningSummarySchema.parse(await readJson(request))
  await updateMorningSummary(userId, values)
  revalidatePath("/activity")
  return { morningSummary: await getMorningSummary(userId) }
})
