import { absoluteUrl } from "./content"
import { markdownForPath, markdownPaths, pricingMarkdown } from "./markdown"
import {
  brandName,
  marketingUpdated,
  productName,
  publicPlans,
  siteDescription,
} from "./site"

// The public docs MCP server at /mcp (app/mcp/route.ts): read-only tools over
// the same Markdown copies agents get from the public pages, so the two can't
// drift. It needs no sign-in and touches no account data. Stateless Streamable
// HTTP: every POST carries one JSON-RPC message or a batch, and the reply is
// plain JSON, never an SSE stream.

export const docsMcpPath = "/mcp"
export const docsMcpName = "krafty-docs"
export const docsMcpVersion = "1.0.0"
export const pricingUiUri = "ui://krafty-docs/pricing"
const appMimeType = "text/html;profile=mcp-app"

const supportedVersions = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
] as const

export const docsMcpInstructions = `Read-only facts about ${productName} (${absoluteUrl("/")}), an AI workspace where people hand tasks to Bots. Search the public pages with search_krafty_docs, read one with get_krafty_page, and get plans with get_krafty_pricing. This server can't sign in, create Bots or read anyone's account; people do that at ${absoluteUrl("/workspace")}.`

type JsonRpcId = string | number | null
type JsonRpcMessage = {
  jsonrpc?: unknown
  id?: JsonRpcId
  method?: unknown
  params?: unknown
}
export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | {
      jsonrpc: "2.0"
      id: JsonRpcId
      error: { code: number; message: string }
    }

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string
  ) {
    super(message)
  }
}

/** One public page, indexed for search. */
type DocsPage = {
  path: string
  url: string
  title: string
  summary: string
  markdown: string
}

function firstParagraph(markdown: string) {
  const paragraphs = markdown.split(/\n{2,}/).slice(1)
  const first = paragraphs.find((part) => !part.startsWith("#")) ?? ""
  return first.replace(/^>\s*/, "").replace(/\s+/g, " ").trim()
}

let pages: DocsPage[] | null = null
function docsPages() {
  pages ??= [...markdownPaths].map((path) => {
    const markdown = markdownForPath(path) ?? ""
    const title = markdown.match(/^# (.+)$/m)?.[1] ?? path
    return {
      path,
      url: absoluteUrl(path),
      title,
      summary: firstParagraph(markdown),
      markdown,
    }
  })
  return pages
}

const words = (text: string) =>
  text
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((word) => word.length > 1) ?? []

/** Pages ranked by how often the query's words appear, titles weighted up. */
export function searchDocs(query: string, limit = 5) {
  const terms = [...new Set(words(query))]
  if (terms.length === 0) return []
  return docsPages()
    .map((page) => {
      const title = words(page.title)
      const body = words(page.markdown)
      let score = 0
      for (const term of terms) {
        score += title.filter((word) => word === term).length * 5
        score += body.filter((word) => word === term).length
      }
      return { page, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.page.path.localeCompare(b.page.path))
    .slice(0, limit)
    .map(({ page }) => ({
      title: page.title,
      path: page.path,
      url: page.url,
      summary: page.summary,
    }))
}

/** Accepts a path ("/how-it-works") or a full kraftybot.app URL. */
function pagePath(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return "/"
  try {
    const url = new URL(trimmed, absoluteUrl("/"))
    if (url.origin !== new URL(absoluteUrl("/")).origin) return null
    return url.pathname.replace(/\.md$/, "").replace(/^\/index$/, "/")
  } catch {
    return null
  }
}

const text = (value: string) => ({ type: "text" as const, text: value })

function pricingPlans() {
  return publicPlans.map((plan) => ({
    name: plan.name,
    priceUsd: plan.price,
    period: plan.period,
    summary: plan.summary,
    features: [...plan.features],
  }))
}

const tools = [
  {
    name: "search_krafty_docs",
    title: "Search Krafty's public pages",
    description: `Search ${productName}'s public pages (features, how it works, safeguards, pricing, use cases, comparisons) and return the best matches with their paths.`,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "What to look for, such as 'approvals' or 'sales prospecting'.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "get_krafty_page",
    title: "Read a Krafty page",
    description: `Return one public ${productName} page as Markdown. Pass a path from search_krafty_docs, such as "/how-it-works", or "/" for the home page.`,
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: 'The page path, such as "/use-cases/sales-prospecting".',
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "get_krafty_pricing",
    title: "Krafty pricing",
    description: `Return ${productName}'s plans, prices in US dollars, limits, and what a task costs. Hosts that support MCP Apps show the plans as cards.`,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: pricingUiUri } },
  },
] as const

function callTool(name: unknown, args: Record<string, unknown>) {
  switch (name) {
    case "search_krafty_docs": {
      const query = typeof args.query === "string" ? args.query : ""
      const results = searchDocs(query)
      return {
        content: [
          text(
            results.length === 0
              ? `No public page matches "${query}". Try fewer or broader words, or read ${absoluteUrl("/llms.txt")} for the full list.`
              : results
                  .map(
                    (result) =>
                      `- [${result.title}](${result.url}) (path ${result.path}): ${result.summary}`
                  )
                  .join("\n")
          ),
        ],
        structuredContent: { results },
      }
    }
    case "get_krafty_page": {
      const path = pagePath(typeof args.path === "string" ? args.path : "")
      const markdown = path === null ? null : markdownForPath(path)
      if (markdown === null) {
        return {
          isError: true,
          content: [
            text(
              `No public page at "${String(args.path)}". Pages: ${[...markdownPaths].join(", ")}`
            ),
          ],
        }
      }
      return { content: [text(markdown)] }
    }
    case "get_krafty_pricing":
      return {
        content: [text(pricingMarkdown())],
        structuredContent: { currency: "USD", plans: pricingPlans() },
      }
    default:
      throw new RpcError(-32602, `Unknown tool: ${String(name)}`)
  }
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")

/**
 * The MCP App for get_krafty_pricing. The plans are rendered in, so it shows
 * the right prices without the tool result; the script only completes the
 * host handshake and reports its height. It loads nothing from the network.
 */
export function pricingAppHtml() {
  const cards = pricingPlans()
    .map(
      (plan) => `<section class="card">
<h2>${escapeHtml(plan.name)}</h2>
<p class="price">${plan.priceUsd === 0 ? "$0" : `$${plan.priceUsd}<span>/${escapeHtml(plan.period ?? "")}</span>`}</p>
<p>${escapeHtml(plan.summary)}</p>
<ul>${plan.features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}</ul>
</section>`
    )
    .join("\n")
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(brandName)} pricing</title>
<style>
:root { color-scheme: light dark; font-family: var(--font-sans, system-ui, sans-serif); }
body { margin: 0; padding: 16px; background: var(--color-background-primary, Canvas); color: var(--color-text-primary, CanvasText); }
.plans { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.card { border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: 16px; padding: 16px; }
h2 { margin: 0 0 4px; font-size: 16px; }
.price { margin: 0 0 8px; font-size: 28px; font-weight: 600; }
.price span { font-size: 14px; font-weight: 400; opacity: 0.7; }
p { margin: 0 0 8px; font-size: 14px; }
ul { margin: 0; padding-left: 18px; font-size: 14px; line-height: 1.5; }
a { color: inherit; }
.note { margin-top: 12px; font-size: 12px; opacity: 0.7; }
</style>
</head>
<body>
<div class="plans">
${cards}
</div>
<p class="note">Prices in US dollars. <a href="${absoluteUrl("/#pricing")}" target="_blank" rel="noopener">See pricing on ${escapeHtml(brandName)}</a></p>
<script>
(() => {
  let nextId = 1
  const post = (message) => window.parent.postMessage({ jsonrpc: "2.0", ...message }, "*")
  const reportSize = () =>
    post({ method: "ui/notifications/size-changed", params: { height: document.documentElement.scrollHeight } })
  const id = nextId++
  window.addEventListener("message", (event) => {
    const data = event.data
    if (!data || data.jsonrpc !== "2.0" || data.id !== id) return
    post({ method: "ui/notifications/initialized", params: {} })
    reportSize()
  })
  post({
    id,
    method: "ui/initialize",
    params: {
      protocolVersion: "2026-01-26",
      appInfo: { name: "${docsMcpName}-pricing", version: "${docsMcpVersion}" },
      appCapabilities: { availableDisplayModes: ["inline"] },
    },
  })
  new ResizeObserver(reportSize).observe(document.body)
})()
</script>
</body>
</html>
`
}

function resources() {
  return [
    {
      uri: pricingUiUri,
      name: "pricing_cards",
      title: `${brandName} pricing cards`,
      description: `${productName} plans as cards, for get_krafty_pricing.`,
      mimeType: appMimeType,
    },
    ...docsPages().map((page) => ({
      uri: page.url,
      name: page.path === "/" ? "home" : page.path.slice(1),
      title: page.title,
      description: page.summary,
      mimeType: "text/markdown",
    })),
  ]
}

function readResource(uri: unknown) {
  if (uri === pricingUiUri) {
    return {
      contents: [
        {
          uri: pricingUiUri,
          mimeType: appMimeType,
          text: pricingAppHtml(),
          _meta: { ui: { prefersBorder: false } },
        },
      ],
    }
  }
  const page = docsPages().find((entry) => entry.url === uri)
  if (!page) throw new RpcError(-32002, `Resource not found: ${String(uri)}`)
  return {
    contents: [
      { uri: page.url, mimeType: "text/markdown", text: page.markdown },
    ],
  }
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

function dispatch(method: string, params: Record<string, unknown>) {
  switch (method) {
    case "initialize": {
      const requested = params.protocolVersion
      const protocolVersion = supportedVersions.find(
        (version) => version === requested
      )
      return {
        protocolVersion: protocolVersion ?? supportedVersions[0],
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false, subscribe: false },
          prompts: { listChanged: false },
          extensions: {
            "io.modelcontextprotocol/ui": { mimeTypes: [appMimeType] },
          },
        },
        serverInfo: {
          name: docsMcpName,
          title: `${productName} docs`,
          version: docsMcpVersion,
          websiteUrl: absoluteUrl("/"),
        },
        instructions: docsMcpInstructions,
      }
    }
    case "ping":
      return {}
    case "tools/list":
      return { tools }
    case "tools/call":
      return callTool(params.name, record(params.arguments))
    case "resources/list":
      return { resources: resources() }
    case "resources/templates/list":
      return { resourceTemplates: [] }
    case "resources/read":
      return readResource(params.uri)
    case "prompts/list":
      return { prompts: [] }
    default:
      throw new RpcError(-32601, `Method not found: ${method}`)
  }
}

/**
 * Handles one JSON-RPC message. Returns null for notifications, which get no
 * reply.
 */
export function handleDocsMcpMessage(message: unknown): JsonRpcResponse | null {
  const { jsonrpc, id, method, params } = record(message) as JsonRpcMessage
  const isRequest = id !== undefined
  if (jsonrpc !== "2.0" || typeof method !== "string") {
    return {
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code: -32600, message: "Invalid request" },
    }
  }
  if (!isRequest) return null
  try {
    return { jsonrpc: "2.0", id, result: dispatch(method, record(params)) }
  } catch (error) {
    if (error instanceof RpcError) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: error.code, message: error.message },
      }
    }
    throw error
  }
}

/** The server card at /.well-known/mcp/server-card.json (SEP-2127). */
export function docsMcpServerCard() {
  return {
    $schema:
      "https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json",
    version: "1.0",
    protocolVersion: supportedVersions[0],
    serverInfo: {
      name: docsMcpName,
      title: `${productName} docs`,
      version: docsMcpVersion,
    },
    description: `Read-only MCP server for ${productName}'s public pages: what it is, how it works, safeguards, pricing and use cases. ${siteDescription}`,
    iconUrl: absoluteUrl("/icon.png"),
    documentationUrl: absoluteUrl("/llms.txt"),
    websiteUrl: absoluteUrl("/"),
    transport: { type: "streamable-http", endpoint: absoluteUrl(docsMcpPath) },
    remotes: [{ type: "streamable-http", url: absoluteUrl(docsMcpPath) }],
    capabilities: {
      tools: { listChanged: false },
      resources: { listChanged: false, subscribe: false },
      prompts: { listChanged: false },
      extensions: {
        "io.modelcontextprotocol/ui": { mimeTypes: [appMimeType] },
      },
    },
    authentication: { required: false, schemes: [] },
    instructions: docsMcpInstructions,
    updated: marketingUpdated,
  }
}
