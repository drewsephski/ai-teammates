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
  // Present (true) only when a reconnect would help: the connection stopped
  // working (`connected` is false then), or it works but a call was refused
  // for a missing permission (`connected` stays true). Offer a reconnect card.
  needsReconnect?: true
}

// `accounts` are the person's usable accounts after plan limits, so a toolkit
// hidden by a downgrade reads as not connected.
export function appCatalogEntry(
  app: { toolkit: string; name: string; logo?: string | null },
  auth: ToolkitAuth,
  accounts: { toolkit: string }[],
  tier: PlanTier,
  // Apps whose connection stopped working; ignored while one still works
  reconnect: ReadonlySet<string> = new Set(),
  // Apps that work but lack a permission; flagged even though connected
  limited: ReadonlySet<string> = new Set()
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
    ...((limited.has(app.toolkit) ||
      (!isConnected && reconnect.has(app.toolkit))) && {
      needsReconnect: true as const,
    }),
  }
}

// What the connect card shows, or why it can't be shown
export function appConnectionState(entry: AppCatalogEntry) {
  // A working connection that lacks a permission can be reconnected
  if (entry.connected && !entry.needsReconnect)
    throw new Error(
      `${entry.name} is already connected, so don't ask them to connect it again. Use searchAppTools to find its tools. If the first search misses the action, search again with different words before using the computer.`
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

// ---- Query refinement -------------------------------------------------------
// Composio's catalog search is keyword-ish, so a descriptive request ("school
// grades") can find nothing where the brand name ("canvas") would hit. When
// the first search comes back short, findApps may retry with these. Pure and
// deterministic: the same query always refines the same way.

// Provider calls one findApps may make, the original search included
export const MAX_CATALOG_SEARCHES = 3

const FILLER = new Set(
  (
    "a an and any app apps are as at be by can check data do for from get give " +
    "go has have how i in into is it its look make me my need of on one or our " +
    "please service services show some that the their them this to tool tools " +
    "up use using want we what when where which with work you your integration " +
    "integrations connect connected find help about all"
  ).split(" ")
)

// Everyday words people use for an app category, and the well-known services
// that category usually means. Search terms only; the catalog decides what exists.
const CONCEPT_TERMS: [RegExp, string[]][] = [
  [/\b(?:spreadsheets?|excel|workbooks?)\b/, ["google sheets", "excel"]],
  [
    /\b(?:calendars?|schedul\w*|meetings?|events?)\b/,
    ["google calendar", "outlook"],
  ],
  [/\b(?:e-?mails?|inbox|mailbox)\b/, ["gmail", "outlook"]],
  [
    /\b(?:grades?|classroom|students?|school|homework|assignments?|courses?)\b/,
    ["canvas", "google classroom"],
  ],
  [/\b(?:documents?|docs?|notes?|wiki)\b/, ["google docs", "notion"]],
  [/\b(?:files?|storage|drive|folders?)\b/, ["google drive", "dropbox"]],
  [/\b(?:chat|messag\w*|team ?chat)\b/, ["slack", "discord"]],
  [
    /\b(?:tasks?|to-?dos?|projects?|tickets?|issues?)\b/,
    ["asana", "todoist", "linear"],
  ],
  [/\b(?:crm|leads?|deals?|sales)\b/, ["hubspot", "salesforce"]],
  [/\b(?:payments?|invoices?|billing)\b/, ["stripe", "quickbooks"]],
  [/\b(?:code|repos?|repositor\w*|pull requests?)\b/, ["github", "gitlab"]],
  [/\b(?:video ?calls?|webinars?)\b/, ["zoom", "google meet"]],
]

function words(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
}

function singular(word: string) {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss"))
    return word.slice(0, -1)
  return word
}

// Alternative queries to try after `query`, best first, never repeating it.
// At most MAX_CATALOG_SEARCHES - 1 of them.
export function refineCatalogQueries(query: string): string[] {
  const original = words(query).join(" ")
  const salient = words(query).filter(
    (word) => word.length >= 3 && !FILLER.has(word)
  )
  const tried = new Set([original])
  const out: string[] = []
  const add = (candidate: string) => {
    const value = candidate.trim()
    if (value && !tried.has(value) && out.length < MAX_CATALOG_SEARCHES - 1) {
      tried.add(value)
      out.push(value)
    }
  }
  // 1. The same words without filler ("find my school grades" -> "school grades")
  add(salient.join(" "))
  // 2. Well-known services for the category the words describe
  const text = words(query).join(" ")
  for (const [pattern, terms] of CONCEPT_TERMS)
    if (pattern.test(text)) for (const term of terms) add(term)
  // 3. The most specific single word (longest first, then earliest)
  const single = [...new Set(salient.map(singular))]
    .map((word, index) => ({ word, index }))
    .sort((a, b) => b.word.length - a.word.length || a.index - b.index)
  if (salient.length > 1) for (const { word } of single) add(word)
  return out
}

// A message for the model when nothing matched, so one empty search isn't read
// as "no such app"
export const NO_APP_MATCH_MESSAGE =
  "No app matched. That doesn't prove no integration exists: try the service's own name (for example the brand) or a simpler word. If it still isn't there, use the computer if it's available."
