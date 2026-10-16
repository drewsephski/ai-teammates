import type { PlanTier } from "@/lib/billing-policy"
import { planLimits } from "@/lib/billing-policy"

// How long a toolkit's auth details are kept per worker. They change only when
// Composio adds managed auth or the project configures its own.
export const APP_AUTH_CACHE_MS = 6 * 60 * 60_000
// Composio's session.toolkits() caps a page at 50
export const MAX_CATALOG_PAGE = 50
export const FIND_APPS_LIMIT = { default: 5, max: 10 }
// A Composio toolkit slug, as lib/composio.ts's toolkitSlugSchema checks it
export const toolkitSlugPattern = /^[a-z0-9][a-z0-9_-]{0,99}$/

export type ToolkitAuth = {
  noAuth?: boolean
  managedSchemes?: string[]
  // The project has its own auth config for this toolkit
  projectConfigured: boolean
}

// A Connect link works without a custom auth setup
export function isConnectable(auth: ToolkitAuth) {
  return (
    auth.noAuth === true ||
    (auth.managedSchemes?.length ?? 0) > 0 ||
    auth.projectConfigured
  )
}

export type AppCatalogEntry = {
  toolkit: string
  name: string
  logo: string | null
  connected: boolean
  connectable: boolean
  blockedByPlan: boolean
}

// `accounts` are the person's usable accounts after plan limits, so a toolkit
// hidden by a downgrade reads as not connected.
export function appCatalogEntry(
  app: { toolkit: string; name: string; logo?: string | null },
  auth: ToolkitAuth,
  accounts: { toolkit: string }[],
  tier: PlanTier
): AppCatalogEntry {
  const connected = new Set(accounts.map((account) => account.toolkit))
  const isConnected = connected.has(app.toolkit)
  return {
    toolkit: app.toolkit,
    name: app.name,
    logo: httpsLogo(app.logo),
    connected: isConnected,
    connectable: isConnectable(auth),
    blockedByPlan: !isConnected && connected.size >= planLimits[tier].apps,
  }
}

// What the connect card shows, or why it can't be shown
export function appConnectionState(entry: AppCatalogEntry) {
  if (entry.connected)
    throw new Error(
      `${entry.name} is already connected. Use its app tools instead.`
    )
  if (!entry.connectable)
    throw new Error(
      `${entry.name} can't be connected from chat because it needs a custom authentication setup. Use the computer instead.`
    )
  return entry.blockedByPlan ? ("planLimit" as const) : ("connect" as const)
}

// Only an https image URL from the catalog is ever shown
export function httpsLogo(logo: string | null | undefined) {
  if (!logo || !URL.canParse(logo)) return null
  return new URL(logo).protocol === "https:" ? logo : null
}
