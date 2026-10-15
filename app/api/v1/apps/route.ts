import { apiRoute } from "@/lib/api"
import { listConnectorApps } from "@/services/connectors"

// The app catalog with this person's connections: ?search=&cursor=&connected=true
export const GET = apiRoute(async ({ userId }, request) => {
  const params = request.nextUrl.searchParams
  return listConnectorApps(userId, {
    search: params.get("search") ?? "",
    cursor: params.get("cursor") ?? undefined,
    connected: params.get("connected") === "true",
  })
})
