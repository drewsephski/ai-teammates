import { apiRoute, readJson } from "@/lib/api"
import {
  getFantasySettings,
  saveFantasySettings,
} from "@/services/fantasy-football"

type Context = { params: Promise<{ botId: string }> }
export const GET = apiRoute<Context>(
  async ({ userId }, _request, { params }) => ({
    settings: await getFantasySettings(userId, (await params).botId),
  })
)
export const PUT = apiRoute<Context>(
  async ({ userId }, request, { params }) => ({
    settings: await saveFantasySettings(
      userId,
      (await params).botId,
      await readJson(request)
    ),
  })
)
