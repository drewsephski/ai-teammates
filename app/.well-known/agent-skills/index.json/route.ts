import { agentSkillsIndex } from "@/lib/marketing/agent-discovery"
import { discoveryJson } from "@/lib/marketing/agent-response"

// Agent Skills Discovery index (schemas.agentskills.io/discovery/0.2.0).
export function GET() {
  return discoveryJson(agentSkillsIndex())
}
