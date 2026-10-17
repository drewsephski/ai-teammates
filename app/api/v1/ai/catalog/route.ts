import { modelCatalogSchema } from "@/db/schema"
import { apiRoute, readJson } from "@/lib/api"
import { listProviderModels } from "@/services/model-keys"

// The models a key can use, before saving it. Leave apiKey out to list the
// saved key's models.
export const POST = apiRoute(async ({ userId }, request) => {
  const input = modelCatalogSchema.parse(await readJson(request))
  return { models: await listProviderModels(userId, input) }
})
