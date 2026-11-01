"use client"

import { useEffect } from "react"

// WebMCP (webmachinelearning.github.io/webmcp): tools a browser agent can call
// on this page. The read tools forward to the public docs MCP server at /mcp
// (lib/marketing/docs-mcp.ts), so both answer from the same Markdown. The
// navigation tool only opens pages on this site. None of them read or change
// the signed-in account.

type ToolResult = { content: { type: "text"; text: string }[] }

type ModelContextTool = {
  name: string
  title?: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: { readOnlyHint?: boolean }
  execute: (input: Record<string, unknown>) => Promise<ToolResult>
}

type ModelContext = {
  registerTool: (
    tool: ModelContextTool,
    options?: { signal?: AbortSignal }
  ) => unknown
}

const text = (value: string): ToolResult => ({
  content: [{ type: "text", text: value }],
})

async function callDocsTool(name: string, args: Record<string, unknown>) {
  const response = await fetch("/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  })
  const reply = (await response.json()) as {
    result?: ToolResult
    error?: { message: string }
  }
  if (!reply.result) throw new Error(reply.error?.message ?? "Request failed")
  return { content: reply.result.content }
}

const tools: ModelContextTool[] = [
  {
    name: "search_krafty_docs",
    title: "Search Krafty's public pages",
    description:
      "Search Krafty Bot's public pages (features, how it works, safeguards, pricing, use cases) and return matching pages with their paths.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for." },
      },
      required: ["query"],
    },
    annotations: { readOnlyHint: true },
    execute: ({ query }) =>
      callDocsTool("search_krafty_docs", { query: String(query ?? "") }),
  },
  {
    name: "get_krafty_page",
    title: "Read a Krafty page",
    description:
      'Return a public Krafty Bot page as Markdown, such as "/how-it-works" or "/" for the home page.',
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "The page path." },
      },
      required: ["path"],
    },
    annotations: { readOnlyHint: true },
    execute: ({ path }) =>
      callDocsTool("get_krafty_page", { path: String(path ?? "/") }),
  },
  {
    name: "get_krafty_pricing",
    title: "Krafty pricing",
    description:
      "Return Krafty Bot's plans, prices in US dollars, limits, and what a task costs.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: () => callDocsTool("get_krafty_pricing", {}),
  },
  {
    name: "open_krafty_page",
    title: "Open a Krafty page",
    description:
      'Open a page on this site in the current tab, such as "/use-cases", "/sign-up" to create an account, or "/workspace" once signed in. The person signs in themselves.',
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: 'A path on this site, starting with "/".',
        },
      },
      required: ["path"],
    },
    execute: async ({ path }) => {
      const target = String(path ?? "")
      // Same-origin paths only; "//host" would leave the site.
      if (!/^\/(?![/\\])/.test(target)) {
        return text('Give a path on this site that starts with "/".')
      }
      window.location.assign(target)
      return text(`Opening ${target}.`)
    },
  },
]

export function WebMcpTools() {
  useEffect(() => {
    const modelContext =
      (document as Document & { modelContext?: ModelContext }).modelContext ??
      (navigator as Navigator & { modelContext?: ModelContext }).modelContext
    if (!modelContext?.registerTool) return
    const controller = new AbortController()
    for (const tool of tools) {
      try {
        // Returns a promise in newer Chrome builds; a rejection only means the
        // tool isn't available, which never breaks the page.
        Promise.resolve(
          modelContext.registerTool(tool, { signal: controller.signal })
        ).catch(() => {})
      } catch {
        // A duplicate name (a remount before the abort lands) is harmless.
      }
    }
    return () => controller.abort()
  }, [])
  return null
}
