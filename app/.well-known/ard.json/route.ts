import { ardManifest } from "@/lib/marketing/agent-discovery"
import { discoveryJson } from "@/lib/marketing/agent-response"

// Agentic Resource Discovery manifest (agenticresourcediscovery.org).
export function GET() {
  return discoveryJson(ardManifest())
}
