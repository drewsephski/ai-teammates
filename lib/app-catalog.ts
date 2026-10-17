import {
  APP_AUTH_CACHE_MS,
  MAX_CATALOG_PAGE,
  NO_APP_MATCH_MESSAGE,
  appCatalogEntry,
  appConnectionState,
  refineCatalogQueries,
  type ToolkitAuth,
} from "@/lib/app-catalog-policy"
import type { FindAppsInput, FindAppsResult } from "@/lib/app-catalog-tools"
import type { PlanTier } from "@/lib/billing-policy"
import type { AppAccount } from "@/lib/connector-tools"

// The Composio client and the database come in on first use, so the policy and
// the injected paths load without environment variables.
const composio = () => import("@/lib/composio")

export type CatalogToolkit = {
  slug: string
  name: string
  logo?: string | null
}
export type CatalogAuth = {
  noAuth?: boolean
  managedSchemes?: string[]
  name?: string
  logo?: string | null
}

export type AppCatalogDeps = {
  configured: () => boolean
  searchToolkits: (
    userId: string,
    query: string,
    limit: number
  ) => Promise<CatalogToolkit[]>
  // Only slugs the catalog knows come back
  getToolkitAuth: (slugs: string[]) => Promise<Map<string, CatalogAuth>>
  projectToolkits: () => Promise<Set<string>>
  accounts: (userId: string) => Promise<AppAccount[]>
  tier: (userId: string) => Promise<PlanTier>
  // Toolkits whose connection stopped working. Optional and best effort: a
  // failure only means no reconnect hint.
  reconnectToolkits?: (
    userId: string,
    accounts: AppAccount[]
  ) => Promise<Set<string>>
  // Apps whose account works but was refused for a missing permission
  limitedToolkits?: (userId: string) => Promise<Set<string>>
}

// Per worker. Toolkit auth changes only when Composio adds managed auth or the
// project configures its own, so it is kept for hours.
const authCache = new Map<string, { at: number; auth: CatalogAuth }>()
let projectCache: { at: number; slugs: Set<string> } | undefined

export function resetAppCatalogCache() {
  authCache.clear()
  projectCache = undefined
}

const GET_MANY_CHUNK = 20

async function composioToolkitAuth(slugs: string[]) {
  const found = new Map<string, CatalogAuth>()
  for (let index = 0; index < slugs.length; index += GET_MANY_CHUNK) {
    const chunk = slugs.slice(index, index + GET_MANY_CHUNK)
    const toolkits = await (
      await composio()
    )
      .getComposio()
      .toolkits.getMany(chunk, {
        limit: chunk.length,
      })
    for (const toolkit of toolkits)
      found.set(toolkit.slug, {
        noAuth: toolkit.noAuth,
        managedSchemes: toolkit.composioManagedAuthSchemes,
        name: toolkit.name,
        logo: toolkit.meta?.logo ?? null,
      })
  }
  return found
}

async function composioProjectToolkits() {
  const slugs = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await (await composio()).getComposio().authConfigs.list({
      isComposioManaged: false,
      limit: 100,
      cursor,
    })
    for (const config of page.items) slugs.add(config.toolkit.slug)
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  return slugs
}

// One unfiltered discovery session per person is enough for a few minutes; a
// refined search reuses it instead of creating another over the network.
const SESSION_MS = 5 * 60_000
const discoverySessions = new Map<
  string,
  { at: number; session: Promise<DiscoverySession> }
>()
type DiscoverySession = Awaited<
  ReturnType<Awaited<ReturnType<typeof composio>>["createConnectorSession"]>
>
function discoverySession(userId: string) {
  const cached = discoverySessions.get(userId)
  if (cached && Date.now() - cached.at < SESSION_MS) return cached.session
  const session = composio().then((module) =>
    module.createConnectorSession(userId)
  )
  discoverySessions.set(userId, { at: Date.now(), session })
  session.catch(() => discoverySessions.delete(userId))
  return session
}

export const defaultAppCatalogDeps: AppCatalogDeps = {
  configured: () => Boolean(process.env.COMPOSIO_API_KEY),
  async searchToolkits(userId, query, limit) {
    const session = await discoverySession(userId)
    const result = await session.toolkits({
      search: query,
      limit: Math.min(limit, MAX_CATALOG_PAGE),
    })
    return result.items.map((item) => ({
      slug: item.slug,
      name: item.name,
      logo: item.logo,
    }))
  },
  getToolkitAuth: composioToolkitAuth,
  projectToolkits: composioProjectToolkits,
  accounts: async (userId) => (await composio()).activeAccounts(userId),
  reconnectToolkits: async (userId, accounts) =>
    (await composio()).reconnectToolkits(userId, accounts),
  limitedToolkits: async (userId) =>
    (await composio()).limitedConnectorToolkits(userId),
  async tier(userId) {
    const { getAccountPlan } = await import("@/lib/usage")
    return (await getAccountPlan(userId)).tier
  },
}

// Auth for each slug, fetching only those not cached
async function toolkitAuth(
  slugs: string[],
  deps: Pick<AppCatalogDeps, "getToolkitAuth">
) {
  const now = Date.now()
  const result = new Map<string, CatalogAuth>()
  const missing: string[] = []
  for (const slug of new Set(slugs)) {
    const cached = authCache.get(slug)
    if (cached && now - cached.at < APP_AUTH_CACHE_MS)
      result.set(slug, cached.auth)
    else missing.push(slug)
  }
  if (missing.length) {
    const fetched = await deps.getToolkitAuth(missing)
    for (const [slug, auth] of fetched) {
      authCache.set(slug, { at: now, auth })
      result.set(slug, auth)
    }
  }
  return result
}

async function projectSlugs(deps: Pick<AppCatalogDeps, "projectToolkits">) {
  if (projectCache && Date.now() - projectCache.at < APP_AUTH_CACHE_MS)
    return projectCache.slugs
  const slugs = await deps.projectToolkits()
  projectCache = { at: Date.now(), slugs }
  return slugs
}

// Project auth configs only matter for a toolkit Composio doesn't manage
async function toolkitPolicyAuth(
  slug: string,
  auth: CatalogAuth,
  deps: Pick<AppCatalogDeps, "projectToolkits">
): Promise<ToolkitAuth> {
  const managed = auth.noAuth === true || (auth.managedSchemes?.length ?? 0) > 0
  return {
    noAuth: auth.noAuth,
    managedSchemes: auth.managedSchemes,
    projectConfigured: managed ? false : (await projectSlugs(deps)).has(slug),
  }
}

async function reconnectSets(
  userId: string,
  accounts: AppAccount[],
  deps: Pick<AppCatalogDeps, "reconnectToolkits" | "limitedToolkits">
) {
  const best = async (load?: () => Promise<Set<string>>) => {
    try {
      return (await load?.()) ?? new Set<string>()
    } catch {
      return new Set<string>()
    }
  }
  const [reconnect, limited] = await Promise.all([
    best(
      deps.reconnectToolkits &&
        (() => deps.reconnectToolkits!(userId, accounts))
    ),
    best(deps.limitedToolkits && (() => deps.limitedToolkits!(userId))),
  ])
  return { reconnect, limited }
}

// The first search, and for a thin result a few refined ones (see
// refineCatalogQueries). Capped at MAX_CATALOG_SEARCHES provider calls.
async function searchCatalog(
  userId: string,
  query: string,
  limit: number,
  deps: Pick<AppCatalogDeps, "searchToolkits">
) {
  const merged = new Map<string, CatalogToolkit>()
  const searched = [query]
  for (const app of await deps.searchToolkits(userId, query, limit))
    merged.set(app.slug, app)
  if (merged.size < 2)
    for (const refined of refineCatalogQueries(query)) {
      if (merged.size >= limit) break
      searched.push(refined)
      try {
        for (const app of await deps.searchToolkits(userId, refined, limit))
          if (!merged.has(app.slug)) merged.set(app.slug, app)
      } catch {
        // The first search already answered; a refinement is a bonus
      }
    }
  return { found: [...merged.values()], searched }
}

export async function findApps(
  userId: string,
  input: FindAppsInput,
  deps: AppCatalogDeps = defaultAppCatalogDeps
): Promise<FindAppsResult> {
  if (!deps.configured()) return { configured: false, apps: [] }
  const limit = Math.max(1, Math.min(input.limit, MAX_CATALOG_PAGE))
  const [search, accounts, tier] = await Promise.all([
    searchCatalog(userId, input.query, limit, deps),
    deps.accounts(userId),
    deps.tier(userId),
  ])
  const matches = search.found.slice(0, limit)
  const [auth, { reconnect, limited }] = await Promise.all([
    toolkitAuth(
      matches.map((app) => app.slug),
      deps
    ),
    matches.length
      ? reconnectSets(userId, accounts, deps)
      : { reconnect: new Set<string>(), limited: new Set<string>() },
  ])
  const apps = []
  for (const app of matches) {
    // A toolkit without catalog details can't be connected from here
    const details = auth.get(app.slug) ?? { name: app.name }
    apps.push(
      appCatalogEntry(
        { toolkit: app.slug, name: app.name, logo: app.logo },
        auth.has(app.slug)
          ? await toolkitPolicyAuth(app.slug, details, deps)
          : { projectConfigured: false },
        accounts,
        tier,
        reconnect,
        limited
      )
    )
  }
  return {
    configured: true,
    apps,
    // Which queries ran, only when the first was refined
    ...(search.searched.length > 1 && { searched: search.searched }),
    ...(!apps.length && { message: NO_APP_MATCH_MESSAGE }),
  }
}

// The card's name, logo and state, from the catalog and never from the model.
// Throws a message written for the model when no card can be shown.
export async function prepareAppConnection(
  userId: string,
  app: { toolkit: string; name: string },
  deps: AppCatalogDeps = defaultAppCatalogDeps
) {
  if (!deps.configured())
    throw new Error(
      "App connections are not configured. Use the computer instead."
    )
  const auth = (await toolkitAuth([app.toolkit], deps)).get(app.toolkit)
  if (!auth)
    throw new Error(
      `${app.name} isn't in Krafty's app catalog. Use the computer instead.`
    )
  const [accounts, tier] = await Promise.all([
    deps.accounts(userId),
    deps.tier(userId),
  ])
  const { reconnect, limited } = await reconnectSets(userId, accounts, deps)
  const entry = appCatalogEntry(
    { toolkit: app.toolkit, name: auth.name ?? app.name, logo: auth.logo },
    await toolkitPolicyAuth(app.toolkit, auth, deps),
    accounts,
    tier,
    reconnect,
    limited
  )
  const state = appConnectionState(entry)
  // `reconnect` is set only for an app that was connected and stopped working
  return {
    name: entry.name,
    logo: entry.logo,
    state,
    ...(entry.needsReconnect && { reconnect: true as const }),
  }
}

// A toolkit's display name, best effort
export async function toolkitName(
  slug: string,
  deps: Pick<AppCatalogDeps, "getToolkitAuth"> = defaultAppCatalogDeps
) {
  try {
    return (await toolkitAuth([slug], deps)).get(slug)?.name ?? slug
  } catch {
    return slug
  }
}
