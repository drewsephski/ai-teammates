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
export type FindAppsResult = {
  configured: boolean
  apps: AppCatalogEntry[]
  // Only when a thin first search was retried: every query that ran
  searched?: string[]
  // Only when nothing matched
  message?: string
}

// Catalog discovery across every app, connected or not. `find` is injected so
// tests run offline (lib/app-catalog.ts has the Composio-backed one).
export function createAppCatalogTools(
  find: (input: FindAppsInput) => Promise<FindAppsResult>
) {
  return {
    findApps: tool({
      description:
        "Find apps in Krafty's catalog of integrations, connected or not. Use it when the work needs an app or service that isn't among the person's connected apps, or to check whether one exists. Each match says whether it's connected, connectable from chat, and blocked by the free plan's one-app limit; needsReconnect: true means they connected it before and the connection stopped working, so offer a reconnect card instead of a first connect. Matching is by keyword, so an empty or poor result for a description 'school grades' doesn't prove no integration exists: search again with the service's own name. It never loads tools; use searchAppTools for those.",
      inputSchema: findAppsInputSchema,
      execute: (input) => find(findAppsInputSchema.parse(input)),
    }),
  }
}

export type AppCatalogTools = ReturnType<typeof createAppCatalogTools>
