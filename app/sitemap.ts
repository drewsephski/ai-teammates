import type { MetadataRoute } from "next"

import { useCases } from "@/app/use-cases/use-cases-data"
import { marketingUpdated, siteUrl } from "@/lib/marketing/site"

// Last edits to the legal pages; keep in sync with their "Last updated" lines.
const legalUpdated = {
  privacy: "2026-10-17",
  terms: "2026-10-15",
  support: "2026-10-15",
  deleteAccount: "2026-10-17",
}

export default function sitemap(): MetadataRoute.Sitemap {
  // /pricing redirects visitors to the homepage's canonical pricing section.
  return [
    { path: "/", lastModified: marketingUpdated, priority: 1 },
    { path: "/how-it-works", lastModified: marketingUpdated, priority: 0.9 },
    { path: "/use-cases", lastModified: marketingUpdated, priority: 0.8 },
    ...useCases.map((useCase) => ({
      path: `/use-cases/${useCase.id}`,
      lastModified: marketingUpdated,
      priority: 0.7,
    })),
    { path: "/privacy", lastModified: legalUpdated.privacy, priority: 0.3 },
    { path: "/terms", lastModified: legalUpdated.terms, priority: 0.3 },
    { path: "/support", lastModified: legalUpdated.support, priority: 0.3 },
    {
      path: "/delete-account",
      lastModified: legalUpdated.deleteAccount,
      priority: 0.3,
    },
  ].map(({ path, lastModified, priority }) => ({
    url: new URL(path, siteUrl).href,
    lastModified,
    priority,
  }))
}
