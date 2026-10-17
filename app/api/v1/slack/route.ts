import { revalidatePath } from "next/cache"

import { slackSettingsSchema } from "@/db/schema"
import { apiRoute, readJson } from "@/lib/api"
import {
  disconnectSlack,
  getSlackStatus,
  updateSlackSettings,
} from "@/services/slack"

// Installing needs Slack's consent page in a signed-in browser
// (/api/slack/install); the app reads and manages the connection here
export const GET = apiRoute(async ({ userId }) => ({
  slack: await getSlackStatus(userId),
}))

// { botId } picks who answers messages that don't name a bot; null is the first
export const PATCH = apiRoute(async ({ userId }, request) => {
  const input = slackSettingsSchema.parse(await readJson(request))
  const slack = await updateSlackSettings(userId, input)
  revalidatePath("/activity")
  return { slack }
})

export const DELETE = apiRoute(async ({ userId }) => {
  const slack = await disconnectSlack(userId)
  revalidatePath("/activity")
  return { slack }
})
