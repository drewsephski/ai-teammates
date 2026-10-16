// Reads Composio's catalog to check the "connectable" rule behind findApps and
// the connect card. No model calls, no connection, no tool execution. The
// catalog search creates one Tool Router session for a throwaway user ID with
// no accounts; nothing else is written.
// Run: pnpm exec tsx --env-file=.env.local scripts/verify-app-catalog.ts
import { Composio } from "@composio/core"

import { isConnectable } from "../lib/app-catalog-policy"

const client = new Composio({ apiKey: process.env.COMPOSIO_API_KEY })

// The apps the people in the plan named, plus known API-key-only toolkits
const slugs = [
  "googlesheets",
  "googledrive",
  "gmail",
  "excel",
  "zillow",
  "canvas",
  "blackboard",
  "espn",
  "tavily",
  "serpapi",
  "apollo",
  "openai",
]

const toolkits = await client.toolkits.getMany(slugs)
const found = new Set(toolkits.map((toolkit) => toolkit.slug))
console.log("toolkits.getMany")
for (const toolkit of toolkits)
  console.log(
    JSON.stringify({
      slug: toolkit.slug,
      name: toolkit.name,
      noAuth: toolkit.noAuth ?? null,
      authSchemes: toolkit.authSchemes ?? null,
      composioManagedAuthSchemes: toolkit.composioManagedAuthSchemes ?? null,
      connectable: isConnectable({
        noAuth: toolkit.noAuth,
        managedSchemes: toolkit.composioManagedAuthSchemes,
        projectConfigured: false,
      }),
    })
  )
console.log(
  "not in catalog:",
  slugs.filter((slug) => !found.has(slug))
)

// Toolkits this project configured itself (no secrets are printed)
const projectConfigs = await client.authConfigs.list({
  isComposioManaged: false,
})
console.log(
  "project auth configs:",
  projectConfigs.items.map((config) => ({
    toolkit: config.toolkit.slug,
    authScheme: config.authScheme ?? null,
    status: config.status,
  }))
)

// The same catalog search findApps runs, as a user with no accounts
const session = await client.create("verify-app-catalog", {
  sandbox: { enable: false },
  manageConnections: { enable: false },
})
for (const search of ["spreadsheet", "real estate", "fantasy football"]) {
  const result = await session.toolkits({ search, limit: 5 })
  console.log(
    `session.toolkits(${JSON.stringify(search)})`,
    result.items.map((item) => ({
      slug: item.slug,
      isNoAuth: item.isNoAuth,
      connected: item.connection?.isActive ?? false,
    }))
  )
}
