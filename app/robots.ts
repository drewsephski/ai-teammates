import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/sign-in",
        "/sign-up",
        "/workspace",
        "/usage",
        "/memory",
        "/activity",
        "/chats/",
        "/auth/",
        "/api/",
      ],
    },
    sitemap: "https://kraftybot.app/sitemap.xml",
  }
}
