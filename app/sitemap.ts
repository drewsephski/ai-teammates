import type { MetadataRoute } from "next"

export default function sitemap(): MetadataRoute.Sitemap {
  // /pricing redirects visitors to the homepage's canonical pricing section.
  return ["/", "/privacy", "/terms"].map((path) => ({
    url: new URL(path, "https://kraftybot.app").href,
  }))
}
