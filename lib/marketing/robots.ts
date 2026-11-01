import type { MetadataRoute } from "next"

import { siteUrl } from "./site"

// robots.txt, served by app/robots.txt/route.ts rather than a robots.ts
// metadata file, because Next's robots format has no Content-Signal or Agentmap
// lines.

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

export function robots(): MetadataRoute.Robots {
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

/**
 * Content Signals (contentsignals.org) for the `*` group. They match the
 * crawler groups above: search, AI answers and training are all welcome on
 * public pages.
 */
export const contentSignal = "search=yes, ai-input=yes, ai-train=yes"

/** robots.txt in Next's format, plus Content-Signal and an ARD Agentmap. */
export function robotsTxt() {
  const { rules, sitemap, host } = robots()
  const groups = [rules]
    .flat()
    .map((rule) =>
      [
        ...[rule.userAgent ?? "*"]
          .flat()
          .map((agent) => `User-Agent: ${agent}`),
        ...(rule.userAgent === "*" ? [`Content-Signal: ${contentSignal}`] : []),
        ...[rule.allow ?? []].flat().map((path) => `Allow: ${path}`),
        ...[rule.disallow ?? []].flat().map((path) => `Disallow: ${path}`),
      ].join("\n")
    )
  return `${[
    ...groups,
    [
      `Host: ${host}`,
      ...[sitemap ?? []].flat().map((url) => `Sitemap: ${url}`),
      `Agentmap: ${siteUrl}/.well-known/ard.json`,
    ].join("\n"),
  ].join("\n\n")}\n`
}
