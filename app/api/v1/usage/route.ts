import { apiRoute } from "@/lib/api"
import { getUsageSummary } from "@/services/usage"

export const GET = apiRoute(async ({ userId }) => getUsageSummary(userId))
