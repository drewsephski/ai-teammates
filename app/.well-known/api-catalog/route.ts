import { absoluteUrl } from "@/lib/marketing/content"

// RFC 9727 / RFC 9264: catalog only the API available to external callers.
export function GET() {
  return Response.json(
    {
      linkset: [
        {
          anchor: absoluteUrl("/mcp"),
          "service-desc": [
            {
              href: absoluteUrl("/.well-known/openapi.json"),
              type: "application/vnd.oai.openapi+json",
            },
          ],
          "service-doc": [
            { href: absoluteUrl("/auth.md"), type: "text/markdown" },
          ],
          status: [{ href: absoluteUrl("/api/health"), type: "application/json" }],
        },
      ],
    },
    { headers: { "Content-Type": "application/linkset+json" } }
  )
}
