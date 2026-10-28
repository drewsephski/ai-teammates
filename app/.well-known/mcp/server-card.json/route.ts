import { discoveryJson } from "@/lib/marketing/agent-response"
import { docsMcpServerCard } from "@/lib/marketing/docs-mcp"

// MCP Server Card (SEP-2127) for the docs server at /mcp.
export function GET() {
  return discoveryJson(docsMcpServerCard())
}
