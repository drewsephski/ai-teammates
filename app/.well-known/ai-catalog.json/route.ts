import { ardManifest } from "@/lib/marketing/agent-discovery"
import { discoveryJson } from "@/lib/marketing/agent-response"

// ARD's predecessor path, still read by some scanners and registries.
export function GET() {
  return discoveryJson(ardManifest())
}
