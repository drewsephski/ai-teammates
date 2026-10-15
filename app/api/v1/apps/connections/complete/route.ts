import { revalidatePath } from "next/cache"

import { apiRoute, readJson } from "@/lib/api"
import { connectorCallbackSchema } from "@/lib/connector-callback"
import { finishMobileAppConnection } from "@/services/connectors"

// Finishes a connection with the parameters the app link carried:
// { state, status, accountId }. Each attempt can be completed once.
export const POST = apiRoute(async ({ userId }, request) => {
  const callback = connectorCallbackSchema.parse(await readJson(request))
  const connected = await finishMobileAppConnection(userId, callback)
  if (connected) revalidatePath("/workspace")
  return { connected }
})
