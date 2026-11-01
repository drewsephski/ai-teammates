import { handleDocsMcpMessage } from "@/lib/marketing/docs-mcp"

// The public, read-only docs MCP server (lib/marketing/docs-mcp.ts). It serves
// published marketing facts only, so it takes no session and allows any
// origin. Stateless: no Mcp-Session-Id and no server-sent stream.

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
}

const rpcError = (code: number, message: string, status: number) =>
  Response.json(
    { jsonrpc: "2.0", id: null, error: { code, message } },
    { status, headers }
  )

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return rpcError(-32700, "Parse error", 400)
  }
  const messages = Array.isArray(body) ? body : [body]
  if (messages.length === 0) return rpcError(-32600, "Invalid request", 400)
  const replies = messages
    .map(handleDocsMcpMessage)
    .filter((reply) => reply !== null)
  // Notifications and responses only: accepted, nothing to send back.
  if (replies.length === 0) return new Response(null, { status: 202, headers })
  return Response.json(Array.isArray(body) ? replies : replies[0], { headers })
}

// No server-initiated stream: the server never sends requests of its own.
export function GET() {
  return new Response("This MCP server takes JSON-RPC over POST.\n", {
    status: 405,
    headers: { ...headers, Allow: "POST, OPTIONS" },
  })
}

export function DELETE() {
  return new Response(null, {
    status: 405,
    headers: { ...headers, Allow: "POST, OPTIONS" },
  })
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      ...headers,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id",
    },
  })
}
