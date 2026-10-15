import { apiRoute } from "@/lib/api"
import { getMemoryOverview } from "@/services/memory"

// What the memory page shows: settings, About you, memories and teammates,
// plus the timezones About you accepts (Hermes has no Intl.supportedValuesOf)
export const GET = apiRoute(async ({ userId }) => ({
  ...(await getMemoryOverview(userId)),
  timezones: Intl.supportedValuesOf("timeZone"),
}))
