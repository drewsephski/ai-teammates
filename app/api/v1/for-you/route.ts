import { apiRoute } from "@/lib/api"
import { getForYou } from "@/services/for-you"

// The stored suggestions and the latest scan. Instant: it never scans.
export const GET = apiRoute(async ({ userId }) => getForYou(userId))
