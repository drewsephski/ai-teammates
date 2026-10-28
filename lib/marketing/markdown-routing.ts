import { prefersMarkdown } from "@/lib/content-negotiation"
import { markdownHref, markdownPaths } from "./markdown"

// Where proxy.ts sends a request that asks for Markdown. Agents ask three ways:
// `Accept: text/markdown`, `?mode=agent`, or the page's path plus `.md`
// (`/how-it-works.md`, `/index.md` for the home page). A public page answers
// with its Markdown copy; a path that matches no route answers with a Markdown
// 404 from /md. Everything else, including every signed-in route, is left alone.

/**
 * Top-level route segments under app/, route groups flattened. A Markdown
 * request under one of these is never turned into a 404, since the route may
 * exist. tests/agent-discovery.test.ts keeps this in step with the app folder.
 */
export const appSegments: ReadonlySet<string> = new Set([
  ".well-known",
  "activity",
  "ai-agent-human-approval",
  "ai-agent-vs-chatbot",
  "ai-agents-for-business",
  "ai-employees",
  "ai-teammates",
  "api",
  "auth",
  "auth.md",
  "autonomous-ai-agent",
  "chat-list-check",
  "chats",
  "delete-account",
  "download",
  "forgot-password",
  "grokbot-alternatives",
  "how-it-works",
  "llms-full.txt",
  "llms.txt",
  "manus-alternatives",
  "mcp",
  "md",
  "memory",
  "pricing",
  "pricing.md",
  "privacy",
  "robots.txt",
  "sign-in",
  "sign-up",
  "support",
  "terms",
  "usage",
  "use-cases",
  "workspace",
])

const firstSegment = (path: string) => path.split("/")[1] ?? ""

/** The internal path to rewrite to, or null to serve the request as it is. */
export function markdownRewrite(
  pathname: string,
  searchParams: URLSearchParams,
  accept: string | null
) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname

  if (path.endsWith(".md")) {
    if (path === "/index.md") return markdownHref("/")
    const page = path.slice(0, -".md".length)
    if (markdownPaths.has(page)) return markdownHref(page)
    // A real route that ends in .md (/pricing.md, /auth.md, skills).
    if (appSegments.has(firstSegment(path))) return null
    return markdownHref(page)
  }

  const wantsMarkdown =
    prefersMarkdown(accept) || searchParams.get("mode") === "agent"
  if (!wantsMarkdown) return null
  if (markdownPaths.has(path)) return markdownHref(path)
  // Files (robots.txt, icons, public assets) and known routes stay as they are.
  const last = path.split("/").at(-1) ?? ""
  if (last.includes(".") || appSegments.has(firstSegment(path))) return null
  return markdownHref(path)
}
