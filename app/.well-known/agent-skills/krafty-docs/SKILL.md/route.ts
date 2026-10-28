import { agentSkillMarkdown } from "@/lib/marketing/agent-discovery"
import { discoveryMarkdown } from "@/lib/marketing/agent-response"

// The skill listed in /.well-known/agent-skills/index.json. Its digest there
// is computed from this same text.
export function GET() {
  return discoveryMarkdown(agentSkillMarkdown())
}
