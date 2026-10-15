import type { MetadataRoute } from "next"

import { marketingUpdated, siteUrl } from "@/lib/marketing/site"

// Last edits to the legal pages; keep in sync with their "Last updated" lines.
const legalUpdated = "2026-10-13"

export default function sitemap(): MetadataRoute.Sitemap {
  // /pricing redirects visitors to the homepage's canonical pricing section.
  return [
    { path: "/", lastModified: marketingUpdated, priority: 1 },
    { path: "/use-cases", lastModified: marketingUpdated, priority: 0.8 },
    { path: "/privacy", lastModified: legalUpdated, priority: 0.3 },
    { path: "/terms", lastModified: legalUpdated, priority: 0.3 },
  ].map(({ path, lastModified, priority }) => ({
    url: new URL(path, siteUrl).href,
    lastModified,
    priority,
  }))
}
