import { tool } from "ai"
import { z } from "zod"

import { FIND_APPS_LIMIT, type AppCatalogEntry } from "@/lib/app-catalog-policy"

export const findAppsInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .describe(
      "The app or kind of service in plain English, e.g. 'google sheets' or 'school grades'"
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(FIND_APPS_LIMIT.max)
    .default(FIND_APPS_LIMIT.default),
})
export type FindAppsInput = z.infer<typeof findAppsInputSchema>
export type FindAppsResult = { configured: boolean; apps: AppCatalogEntry[] }

// Catalog discovery across every app, connected or not. `find` is injected so
// tests run offline (lib/app-catalog.ts has the Composio-backed one).
export function createAppCatalogTools(
  find: (input: FindAppsInput) => Promise<FindAppsResult>
) {
  return {
    findApps: tool({
      description:
        "Find apps in Krafty's catalog of integrations, connected or not. Use it when the work needs an app or service that isn't among the person's connected apps, or to check whether one exists. Each match says whether it's connected, connectable from chat, and blocked by the free plan's one-app limit. A missing match means no integration exists for it.",
      inputSchema: findAppsInputSchema,
      execute: (input) => find(findAppsInputSchema.parse(input)),
    }),
  }
}

export type AppCatalogTools = ReturnType<typeof createAppCatalogTools>
