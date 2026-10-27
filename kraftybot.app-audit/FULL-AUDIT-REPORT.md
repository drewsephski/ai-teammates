# kraftybot.app SEO audit

Date: 2026-10-27. Scope: the 20 public marketing pages in /sitemap.xml plus /download and the discovery files. Method: claude-seo 2.5.0, eleven specialist passes (technical, content, on-page, schema, sitemap, performance, visual, GEO, agentic, backlinks, SXO, cluster), synthesized with the PERCEIVE → ANALYZE → VALIDATE → ACT framework. Per-pass detail is in `findings/`.

## Executive summary

**SEO Health Score: 69 / 100.** Business type: SaaS (free plan, $20/month Pro, sign-up CTAs, workspace).

| Category | Weight | Score | Basis |
|---|---|---|---|
| Technical SEO | 22% | 86 | findings/technical.md, sitemap.md |
| Content quality | 23% | 60 | findings/content.md (E-E-A-T 52) |
| On-page SEO | 20% | 72 | findings/content.md |
| Schema | 10% | 80 | findings/schema.md |
| Performance | 10% | 55 (provisional) | findings/performance.md, lab TTFB and page weight only |
| AI search readiness | 10% | 66 | GEO 60 and agentic 78, weighted 2:1 |
| Images | 5% | 40 | zero images or video on any marketing page |

The site is technically sound. Every public page is server-rendered, indexable, self-canonical and unique in title; robots.txt, the sitemap, llms.txt and JSON-LD are all present and valid. Nothing blocks indexing, so there are **no Critical findings**.

What holds the score down is substance and standing, not plumbing. Thirteen of the seventeen non-legal pages are below the word-count floor, the nine use-case pages share one template with only 40 to 51 percent unique copy each, the comparison page does not compare anything, and the domain has no third-party footprint at all (not in Common Crawl, no listings, no mentions found). For the queries the topic pages target, Google serves guides and lists, and kraftybot.app answers with short single-vendor product pages. Good copy on the wrong page type does not rank.

**Top 5 issues**

1. No off-site footprint: no listings, mentions, backlinks or `sameAs` profiles, so nothing supports the topic pages in either Google or AI answers.
2. Thin, templated pages: nine use-case pages at 388 to 435 words from one skeleton, three topic pages at 370 to 565 words that restate the same five features.
3. Page-type mismatch: `/manus-alternatives` targets a list query but names no alternatives; the three topic pages target guide queries with product pages.
4. Homepage weight: 1.07 MB raw HTML (95 inline SVGs, 862 KB), about 822 KB gzip of JavaScript, and Clerk loaded for signed-out visitors on every marketing page. Lab Core Web Vitals could not be measured, so this is a risk, not a confirmed failure.
5. No proof of experience: no about page, screenshots, video, case studies or named author anywhere.

**Top 5 quick wins** (each under a day)

1. Redirect `www.kraftybot.app` to the apex with a 301 (it serves a 200 duplicate today).
2. Add `/download` to the sitemap, trim the four long meta descriptions, and extend the homepage footer so it links the 11 pages it currently omits.
3. Add `sameAs`, `seller` and a ContactPage block to the schema, and replace the personal Gmail address in `contactPoint` with a role address on the domain.
4. Add the four topic pages to `llms-full.txt` and give the llms.txt link descriptions their own wording.
5. Verify Bing Webmaster Tools and turn on IndexNow (ChatGPT search and Copilot read Bing), and set a PageSpeed Insights API key so the next audit can measure Core Web Vitals.

## Assumptions this audit rests on

- The goal is non-brand organic and AI-answer traffic now. If the priority is product over acquisition for the next quarter, the content and authority items can wait; the technical quick wins still apply.
- The "we do not publish side-by-side scores" stance on `/manus-alternatives` is a deliberate editorial choice (it lives in the page copy in `lib/marketing/seo-pages.ts`). The recommendation is framed as a decision, not a defect.
- Performance findings are lab-only. CrUX field data needs a Google API key; PageSpeed Insights rate-limited keyless requests; Lighthouse is not installed locally. The 55 is provisional.
- SERP page-type judgments come from a search tool whose index is not Google's live top 10. Treat them as direction, not measurement.
- The operator is a small team. The plan favours a few high-leverage items over many small ones.

## Technical SEO (86)

What works: all 20 sitemap URLs return 200 with no redirect chain; http → https is a single 301; trailing slashes 308 to the canonical form; unknown paths return a true 404 with noindex; `/workspace` redirects to sign-in with `X-Robots-Tag: noindex, nofollow`; HSTS, nosniff, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, Referrer-Policy and a nonce CSP are all set; titles and descriptions are unique across every page; raw and rendered text match with zero console errors.

| Severity | Finding | Evidence | Fix |
|---|---|---|---|
| High | Homepage HTML is 1,068,730 bytes raw (95 KB gzip) | 95 inline SVGs account for 862 KB; inner pages are 38 to 68 KB | Move SVGs to static files or a sprite, lazy-render below-fold sections |
| Medium | No www redirect | `https://www.kraftybot.app/` returns 200 with a canonical to the apex | 301 www → apex at the proxy or in `proxy.ts` |
| Medium | Marketing pages are uncacheable | `cache-control: private, no-cache, no-store` because of the per-request nonce | Consider script hashes instead of a nonce on marketing routes so the CDN can cache |
| Medium | Loose CSP | `connect-src`, `frame-src`, `img-src`, `media-src` include bare `https:`; `script-src` carries `'unsafe-inline'` (ignored under nonce + strict-dynamic) | List explicit origins |
| Low | HSTS is `max-age` only | No `includeSubDomains; preload` | Add once `clerk.kraftybot.app` and other subdomains are HTTPS |
| Low | No Permissions-Policy header | — | Add a restrictive policy |
| Low | Long descriptions on four topic pages | 163 to 195 characters | Trim to about 155 |
| Low | 404 page reuses the homepage description and has two duplicate `robots noindex` tags | — | Give it its own description, one robots tag |
| Low | OG image served with `max-age=0` | `/brand/krafty-social-v1.jpg` is versioned by filename | Long `max-age`, immutable |

Sitemap: valid urlset, 20 URLs (not 21 as first counted), all self-canonical and indexable, no disallowed paths. `/download` is linked, indexable and self-canonical but absent (Medium). `/delete-account` is in the sitemap but not linked from the crawled pages (Low). 16 of 20 `lastmod` values equal the deploy date; `priority` is set and ignored by Google (Low/Info).

## Content quality (60) and on-page SEO (72)

E-E-A-T: Experience 38, Expertise 60, Authoritativeness 30, Trust 70. The copy is accurate, plain and honest; limits and prices are stated openly and match everywhere; readability is Flesch 60 to 81. AI citation readiness is 74 thanks to a clean definition sentence ("Krafty Bot is an AI workspace where you hand Bots actual tasks…"), quotable numbers and llms.txt.

| URL | Words | Verdict |
|---|---|---|
| / | 2,343 (about 60% demo chat) | Pass |
| /how-it-works | 772 | Pass, best page |
| /ai-agents-for-business | 565 | Borderline thin |
| /ai-employees | 416 | Thin |
| /autonomous-ai-agent | 370 | Thin |
| /manus-alternatives | 419 | Thin, wrong intent |
| /use-cases | 978 | Pass (hub) |
| 9 × /use-cases/* | 388 to 435 | Thin, templated |
| /support, /privacy, /terms | 173 / 1,088 / 712 | OK |

| Severity | Finding | Evidence | Fix |
|---|---|---|---|
| High | Use-case pages are thin and templated | One heading skeleton, five identical sentences, 45 to 51% unique against siblings and 40 to 45% once the hub is counted (the hub repeats every starter prompt verbatim) | Add a sample output, a first-run walk-through and role-specific questions per page; aim for 700+ unique words; cut the hub's prompts to teasers |
| High | Little proof of experience or authority | No about page, author, case study, screenshot or video | Add /about, two or three case studies with real outputs, real screenshots |
| Medium | Topic pages restate the same features | All four repeat memory, apps, cloud computer, approvals; keyword-forced H2s; openers written for search | One distinct angle per page; link the feature list to /how-it-works instead of repeating it |
| Medium | Trust gaps | Support is a personal gmail.com address; no legal entity, address or security page | Role address on the domain; a data and security page naming processors; entity in the terms |
| Medium | Homepage footer is a shorter component | Omits /autonomous-ai-agent, /manus-alternatives and all nine use-case pages | Reuse the inner-page footer or link each homepage use-case tab to its page |
| Medium | Several pages compete for "AI agent" | Pillar H1 targets the enterprise-leaning "AI agents for business" | Pillar takes "AI agents for small business"; /ai-employees takes the role framing; /autonomous-ai-agent takes the definition |
| Low | Short titles (27 to 36 chars) and long descriptions on topic pages | — | Rewrite to about 55 and 155 chars |
| Low | Sales Outbound card claims LinkedIn drafts and intent scoring the page doesn't cover | — | Align card and page |
| Low | /autonomous-ai-agent cites non-public "product docs" and uses jargon | "Continuations resume a capped turn" | Plain language, drop the citation |
| Low | Homepage H1 extracts as "AI that does the workKrafty Bot" | Missing separator between spans | Add a space or `aria-label` |

## Search experience (SXO) and clustering

For every target query the search results are guides, definitions, lists or directories; kraftybot.app answers each with a 244 to 565 word product page.

| Query | Dominant page type | kraftybot page | Mismatch |
|---|---|---|---|
| ai agents for business | Guides, blog posts (~78%) | Product page | High |
| ai employees | Guides (~60%), "best of" lists | Product page | High |
| autonomous ai agent | Definitions, glossaries | Thin definition | Medium (right type, too short) |
| manus alternatives | Lists, directories (100%) | One-product page that declines to compare | High (decision) |
| ai sales outbound agent | Guides, tool roundups | Use-case page | High |
| ai support triage | Over half clinical triage; rest ticket guides | Use-case page | High (ambiguous query; retarget to "AI support ticket triage") |

Persona scores: developer checking capability and safety 52, cost-worried small-business owner 55, solo founder 61. The trust sub-scores are lowest because the $20 price appears only on the homepage and there is no security page.

Clustering (34 queries, 12 searches): every query pair except the seed and "best ai agents for small business" shares zero results, so each query family needs its own page and the three topic pages should be kept, not merged. Cannibalization risk is low in the results and moderate on-page (identical meta descriptions). Recommended new pages, in order: `/ai-agent-human-approval`, `/integrations/gmail`, `/ai-agent-cloud-computer`, `/integrations/google-sheets`, `/ai-agent-vs-chatbot`. Fold "best AI agents for small business" into the pillar as a how-to-choose section rather than publishing a self-ranked list. Full link matrix with anchor text: findings/cluster.md.

## Schema (80)

Valid server-rendered JSON-LD graph with `@id` links; SoftwareApplication has category, OS, offers and feature list; Offer prices match copy (0 USD, 20 USD/month); Organization has logo, contactPoint and founder; BreadcrumbList is correct on inner pages including the three-level use-case pages. Nothing deprecated.

| Severity | Finding | Fix |
|---|---|---|
| Medium | No `sameAs` on Organization | Add real profile URLs once they exist (GitHub, X, LinkedIn, Product Hunt) |
| Medium | No aggregateRating or review on SoftwareApplication | Add only when real, verifiable ratings exist |
| Low | `contactPoint.email` is a personal Gmail address | Role address on the domain; add `availableLanguage` |
| Low | /support and /privacy have no JSON-LD or breadcrumb | ContactPage and WebPage blocks (snippets in findings/schema.md) |
| Low | Offers have no `seller`; FOUNDING50 promo not modelled | `"seller": {"@id": ".../#organization"}` |
| Low | `dateModified` equals the build date on every page | Use real content dates |
| Info | FAQPage on /, /ai-agents-for-business, /manus-alternatives | Google retired FAQ rich results for all sites on 2026-05-07. Markup is valid; no action |

## Performance (55, provisional)

Measured: warm TTFB 0.15 to 0.23 s on all four sampled pages (good); homepage HTML 1,069 KB raw / 95 KB gzip, inner pages 53 to 57 KB raw / 12 to 13 KB gzip; two woff2 fonts preloaded and cached immutable; only one third party (Clerk); no images, so CLS risk is low. Not measured: LCP, INP, CLS, cold-start TTFB (PageSpeed Insights rate-limited keyless calls, no CrUX key, Lighthouse not installed).

| Severity | Finding | Fix |
|---|---|---|
| Medium | Homepage JS about 822 KB gzip across 33 chunks (two chunks 437 KB and 299 KB raw) | Dynamic-import the chat demo and below-fold sections; expected saving 300 to 500 KB gzip |
| Medium | Clerk (about 130 KB gzip) loads on every public page for signed-out visitors | Load only on app and auth routes |
| Medium | 2,470 DOM elements and 95 inline SVGs on the homepage | SVG sprite, lazy render; expected 50 to 70% raw HTML reduction |
| Low | Four render-blocking stylesheets, main sheet 40 KB gzip / 260 KB raw | Purge unused CSS, split marketing CSS |
| Low | HTML served gzip, not brotli | Enable brotli at the edge |

## Visual and mobile

All four captured pages (home, /use-cases, /use-cases/sales-outbound, /how-it-works) show the H1 and primary CTA above the fold on desktop (1920×1080) and mobile (375×812). CTAs are about 44 px tall, no horizontal scroll, body text 16 px or larger, no JS-hidden content. Screenshots: `screenshots/`.

| Severity | Finding | Fix |
|---|---|---|
| Medium | Homepage demo chat shows fictional people, emails and timestamps in server-rendered, indexable HTML with only an 11 px "Example" label | Prominent "Example conversation, not real data" label in the demo's own text; neutral persona instead of the founder's name; consider `data-nosnippet` |
| Medium (agentic P2) | The decorative email-draft mock has about 12 unlabeled inputs with realistic fake data | `aria-hidden` or `inert` on the mock, or label every field |
| Low | Dim gray secondary text (subhead, breadcrumbs, timestamps, "Example") likely under 4.5:1 | Raise lightness, 12 px minimum |
| Low | "Open Krafty" and "Try Krafty free" name what looks like one action | Pick one label |

Not verified: sticky nav behaviour and layout shift (capture script is fixed-viewport and refuses custom scripts).

## AI search readiness (66) and agent readiness

GEO 60 (citability 62, structure 72, multi-modal 35, authority 30, technical 92). Agent readiness 78 (accessibility tree 1,045 nodes, 84 interactive, zero unnamed; landmarks present; 2,429 words without JS; llms.txt passes the Lighthouse rules and all 21 links resolve).

| Severity | Finding | Fix |
|---|---|---|
| High | No third-party footprint: zero results on Wikipedia, Hacker News, GitHub, YouTube; Product Hunt 404; not in Common Crawl's graph | Launch on Product Hunt and Show HN; list on AlternativeTo, G2, Capterra, There's An AI For That, Futurepedia, Toolify, BetaList, Uneed; a LinkedIn page and a YouTube demo; then `sameAs` |
| High | /manus-alternatives names no alternatives | Dated list of real alternatives with a criteria table linking to vendors' own pages, or retarget the page (see decision below) |
| Medium | llms-full.txt omits the four topic pages; llms.txt descriptions reuse meta text | Fix in `lib/marketing/llms.ts` and `content.ts` |
| Medium | Topic pages' H2s are labels, not questions; two never define their own term | Question H2s with a 40 to 60 word direct answer under each |
| Medium | No images or video anywhere | Alt-texted screenshots; a demo video with VideoObject |
| Low | Bing indexing unverified | Bing Webmaster Tools and IndexNow |
| Low (opportunity) | No Content-Signal, no Markdown delivery, no WebMCP or `/.well-known` discovery files | All draft standards; optional. Content-Signal is a one-line robots.txt addition |
| Info | robots.txt `Host:` line is non-standard | Harmless |

Lighthouse Agentic Browsing fraction: not measured (PageSpeed Insights 429 on all four runs).

## Backlinks

Domain not present in the Common Crawl web graph (release Jan to Mar 2026): PageRank and harmonic centrality are null. That means "not observed", not "zero links". Referring domains, anchors and toxicity were not measured (no Moz, Bing or DataForSEO key). Link-earning plan in priority order: Product Hunt; Show HN (the interactive landing chat works as the demo); AI directories; AlternativeTo, G2, Capterra; BetaList, Indie Hackers, Uneed; founder posts on dev.to, Hashnode and Indie Hackers about the approval gate and per-account computers; GitHub awesome-lists for AI agents; indie SaaS newsletters and podcasts.

## Decision required: the comparison page

`/manus-alternatives` states "We do not publish side-by-side scores against Manus or other vendors." Every result for that query is a multi-tool list or directory, so the page cannot rank for it as written. Three honest options:

1. Keep the stance and retarget the page to "Krafty Bot vs Manus" (a one-to-one, feature-level comparison without scores), which fits the voice and matches a narrower query.
2. Build a dated, cited alternatives guide that describes each tool in its own words and links to the vendor, without ranking or quoting prices. This is the only option that can win the current query.
3. Drop the page and redirect to the pillar.

Which to pick depends on how strongly the no-comparison rule is held. The audit does not assume.

## What could not be measured

- Field and lab Core Web Vitals (LCP, INP, CLS). Unblock: a Google API key in `~/.config/claude-seo/google-api.json` for CrUX and PageSpeed Insights.
- Referring domains and link quality. Unblock: a free Bing Webmaster Tools or Moz API key.
- Google indexation and impressions. Unblock: Search Console credentials.
- Live Google top-10 page types (the search tool's index was used instead).
- Cold-start TTFB after the Railway service sleeps.
- Reddit, DuckDuckGo and Bing brand mentions (blocked or unrelated results).

## What the next audit should look for

Capture a baseline first (`/seo drift baseline https://kraftybot.app`). Leading indicators, in order of how early they move: Bing Webmaster and Search Console impressions for the "ai agent for small business", "ai agent with human approval" and "ai agent for gmail" families; count of third-party pages mentioning "Krafty Bot" (target: ten within 60 days of launch); referring domains once Bing Webmaster is connected; CrUX data appearing once the homepage crosses the traffic threshold. Re-audit quarterly, or after the launch week.
