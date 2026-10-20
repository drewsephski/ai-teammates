import type { MetadataRoute } from "next"

import { siteUrl } from "@/lib/marketing/site"

// Signed-in and auth routes. Keep in step with the X-Robots-Tag source pattern
// in next.config.ts.
const privatePaths = [
  "/sign-in",
  "/sign-up",
  "/workspace",
  "/usage",
  "/memory",
  "/activity",
  "/chats/",
  "/auth/",
  "/api/",
]

// AI search and assistant crawlers, named so the policy is explicit. A named
// group replaces the `*` group for that crawler, so each repeats the private
// paths. Search crawlers decide whether Krafty can be cited in AI answers;
// training crawlers decide whether models learn about it. Both are allowed on
// public pages, because being known to AI assistants is the point.
const aiSearchCrawlers = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "Claude-SearchBot",
  "Claude-User",
  "meta-webindexer",
  "meta-externalfetcher",
  "Applebot",
  "Bingbot",
  "Googlebot",
  "DuckAssistBot",
  "MistralAI-User",
]
const aiTrainingCrawlers = [
  "GPTBot",
  "ClaudeBot",
  "Google-Extended",
  "Applebot-Extended",
  "meta-externalagent",
  "CCBot",
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: privatePaths },
      { userAgent: aiSearchCrawlers, allow: "/", disallow: privatePaths },
      { userAgent: aiTrainingCrawlers, allow: "/", disallow: privatePaths },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  }
}
