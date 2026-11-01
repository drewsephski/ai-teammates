# Sitemap audit: https://kraftybot.app (2026-10-27)

## Verdict
Valid, healthy sitemap. Single urlset at /sitemap.xml (200, referenced in robots.txt, discovery script: kind=urlset, valid). No index needed (20 URLs, ~2.5 KB). Other common paths (sitemap_index.xml etc.) 404, which is expected.

## Checks
| Check | Result |
|---|---|
| XML / namespace (sitemaps.org/0.9) | Pass |
| URL count | 20 (brief said 21; actual `<loc>` count is 20) |
| lastmod format | Pass (W3C date). 16x 2026-10-26, 2x 2026-10-17, 2x 2026-10-15; mostly identical (Low) |
| changefreq | Not used (good) |
| priority | Present on all 20 (0.3 to 1). Ignored by Google (Info) |
| All URLs 200, no redirects | Pass (20/20, 0 redirects) |
| Self-canonical (absolute, matches loc) | Pass 20/20. Homepage canonical is https://kraftybot.app (no slash), equivalent to loc |
| Indexable | Pass: no robots meta noindex, no X-Robots-Tag on any URL |
| Disallowed paths absent | Pass: /sign-in, /sign-up, /workspace, /usage, /memory, /activity, /chats/, /auth/, /api/ none in sitemap |
| Duplicates / non-canonical host | None |
| Location page gates | N/A (no location pages) |

## Coverage (sitemap vs internal links from /, /use-cases, /how-it-works)
| URL | In sitemap | Linked |
|---|---|---|
| /, /how-it-works, /use-cases, 4 landing pages (ai-agents-for-business, ai-employees, manus-alternatives, autonomous-ai-agent), 8 use-case pages | Yes | Yes |
| /privacy, /terms, /support | Yes (priority 0.3) | Yes |
| /delete-account | Yes (0.3) | Not linked from the three crawled pages (200 OK; likely linked elsewhere, or orphan by internal links) |
| /download | NO | Yes, 200, self-canonical, indexable |

## Issues
1. Medium: /download is linked, indexable, self-canonical but missing from sitemap. Fix: add to app/sitemap.ts (or noindex it deliberately).
2. Low: /delete-account not found in links on /, /use-cases, /how-it-works. Confirm a footer link exists; consider whether a utility page belongs in the sitemap at all (privacy/terms/support are fine).
3. Low: lastmod mostly identical (2026-10-26), likely build/deploy time rather than real content change. Use per-page content dates.
4. Info: priority on every URL is ignored by Google; can drop.
5. Info: brief said 21 URLs; actual is 20.
