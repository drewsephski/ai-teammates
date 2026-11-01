import { pricingMarkdown } from "@/lib/marketing/markdown"

// Plans as plain Markdown, for AI agents comparing products. Built from
// lib/marketing/site.ts and lib/billing-policy.ts, like the pricing section.
export function GET() {
  return new Response(pricingMarkdown(), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  })
}
