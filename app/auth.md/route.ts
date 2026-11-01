import { authMarkdown } from "@/lib/marketing/agent-discovery"
import { discoveryMarkdown } from "@/lib/marketing/agent-response"

// How agents authenticate here (auth.md). Today: they don't need to, and
// can't act in an account.
export function GET() {
  return discoveryMarkdown(authMarkdown())
}
