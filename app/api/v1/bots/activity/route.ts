import { apiRoute } from "@/lib/api"
import { listWorkspaceBots } from "@/services/workspace"

// What each bot is doing now: working, queued, ready, setup or unknown
// (when Trigger.dev can't be reached), like the web workspace
export const GET = apiRoute(async ({ userId }) => ({
  bots: await listWorkspaceBots(userId),
}))
