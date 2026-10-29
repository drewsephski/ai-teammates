import { discoveryJson } from "@/lib/marketing/agent-response"
import { brandName, siteUrl } from "@/lib/marketing/site"

// Poppy draft 0.1 website-only discovery. No session or OAuth support.
export function GET() {
  return discoveryJson({
    protocol_version: "0.1",
    organization: {
      name: brandName,
      domain: new URL(siteUrl).hostname,
    },
    web: {},
  })
}
