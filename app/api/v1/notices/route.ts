import { apiRoute } from "@/lib/api"
import { listNotices } from "@/services/notices"

// Banners for the home screen, until the person dismisses them
export const GET = apiRoute(async ({ userId }) => ({
  notices: await listNotices(userId),
}))
