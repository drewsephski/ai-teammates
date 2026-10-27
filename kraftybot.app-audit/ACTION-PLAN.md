# kraftybot.app action plan

Priorities follow the audit definitions: Critical blocks indexing or causes penalties, High significantly affects rankings (fix within a week), Medium is an optimisation (within a month), Low is backlog. Each item carries the observation it rests on (THINK), what it depends on or unblocks (CONNECT), how we would know it failed (ACCEPT), and a leading indicator to watch without re-auditing (GROW).

## Critical

None. Every public page is indexable, server-rendered and self-canonical.

## High (week 1)

### H1. Establish an off-site footprint
- Rests on: the domain is absent from Common Crawl, has zero mentions on Wikipedia, Hacker News, GitHub or YouTube, and no `sameAs` profiles. Nothing supports the topic pages in Google or in AI answers; mentions weigh more than links for AI citation.
- Do: Product Hunt launch; Show HN with the landing chat as the demo; listings on AlternativeTo, G2, Capterra, There's An AI For That, Futurepedia, Toolify, BetaList, Uneed; a LinkedIn company page and a short YouTube demo; then add every real profile to Organization `sameAs`.
- Depends on: nothing. Unblocks: H3 (directories hold a third of the "alternatives" results), schema sameAs, every ranking item below.
- Failed if: 60 days after launch week, fewer than ten third-party pages mention "Krafty Bot", or Bing Webmaster shows no referring domains.
- Watch: a monthly site-wide search for "Krafty Bot" minus kraftybot.app; Bing Webmaster referring domains.

### H2. Deepen the nine use-case pages and the three topic pages
- Rests on: 13 of 17 non-legal pages are under the word-count floor; use-case pages are 40 to 51 percent unique against each other and share five identical sentences; the topic pages restate the same five features. Clustering shows each query family needs its own page, so deepen rather than merge.
- Do: per use-case page, add a sample output, a first-run walk-through and role-specific questions as H2s, aiming for 700+ unique words; cut the hub's starter prompts to teasers so the hub stops duplicating them. Per topic page: one distinct angle (pillar takes "AI agents for small business", /ai-employees takes the role framing, /autonomous-ai-agent takes the definition and autonomy limits), question H2s with a 40 to 60 word direct answer, link the shared feature list to /how-it-works instead of repeating it. Retarget the support triage page to "AI support ticket triage".
- Depends on: a decision on H3 for the comparison page only. Unblocks: AI citation of the topic pages, M5 (llms-full).
- Failed if: 90 days after publishing, Search Console shows no impressions growth for the "ai agent for small business" or role-page query families.
- Watch: Search Console impressions per page, weekly.

### H3. Decide what /manus-alternatives is for
- Rests on: every result for "manus alternatives" is a multi-tool list or directory; the page says it does not publish comparisons. Page type is chosen before quality, so the page cannot rank as written. The stance is editorial, so this is the owner's call.
- Options: (a) retarget to "Krafty Bot vs Manus" without scores; (b) a dated, cited alternatives guide that describes each tool in its own words and links to the vendor, with no ranking or quoted pricing; (c) redirect to the pillar.
- Depends on: a decision. Unblocks: removes a thin, wrong-intent page from the index either way.
- Failed if: option (b) is chosen and the page earns no impressions for "manus alternatives" within 90 days, or any option draws a complaint about misrepresenting a vendor.
- Watch: Search Console impressions and average position for the query.

### H4. Cut homepage weight
- Rests on: 1.07 MB raw HTML with 95 inline SVGs (862 KB), about 822 KB gzip of JavaScript across 33 chunks, and Clerk (about 130 KB gzip) on every marketing page for signed-out visitors. Lab Core Web Vitals were not measurable, so this is the most likely INP and LCP risk rather than a confirmed failure.
- Do: SVG sprite or static files with lazy render below the fold; dynamic-import the chat demo and below-fold sections; load Clerk only on app and auth routes; purge unused CSS. Target: homepage under 300 KB raw HTML and under 400 KB gzip JS.
- Depends on: nothing. Unblocks: M2 (caching matters more once pages are light).
- Failed if: after shipping, a PageSpeed Insights run (with an API key) still shows INP over 200 ms or LCP over 2.5 s on mobile.
- Watch: homepage HTML and JS bytes in the build output; PageSpeed Insights monthly once keyed.

### H5. Show proof of experience
- Rests on: Experience 38 and Authoritativeness 30 out of 100; no about page, author, screenshot, video or case study; zero images site-wide (multi-modal 35).
- Do: an /about page naming the maker and the entity; real screenshots of an approval and of Bot output with alt text; a 60 to 90 second demo video with VideoObject schema; two or three case studies with real outputs (your own workflows count if labelled as such).
- Depends on: nothing. Unblocks: H1 (launch posts need these assets), schema ratings later.
- Failed if: the persona trust sub-scores do not move on the next SXO pass, or the pages still have zero images.
- Watch: image and video count per page; time on page in analytics once added.

## Medium (month 1)

- M1. 301 `www.kraftybot.app` → apex. Rests on: www serves a 200 duplicate. Failed if: `curl -I https://www.kraftybot.app/` still returns 200. Watch: Search Console shows no www URLs.
- M2. Make marketing pages cacheable. Rests on: the per-request nonce forces `no-store`. Consider script hashes on marketing routes, or cache at the CDN with the nonce injected at the edge. Also replace bare `https:` in the CSP with explicit origins. Failed if: `cache-control` is still `no-store` on `/`. Depends on: H4 first.
- M3. Label the homepage demo honestly and hide the decorative mock. Rests on: fictional names and emails sit in indexable HTML with an 11 px "Example" label; the email-draft mock has about 12 unlabeled inputs. Do: a visible "Example conversation, not real data" line in the demo's own text; a neutral persona; `aria-hidden` or `inert` on the mock; `aria-label` on the demo form; consider `data-nosnippet`. Failed if: a Google snippet for the homepage ever quotes a fictional name.
- M4. Schema completeness. Add `sameAs` (after H1), `seller` on both Offers, ContactPage for /support and WebPage for /privacy with breadcrumbs, a role email on the domain in `contactPoint`, and real `dateModified` values. Snippets: findings/schema.md. Failed if: the Rich Results test still shows the Gmail address.
- M5. Internal linking and discovery. Reuse the inner-page footer on the homepage (11 pages currently unlinked from it); add `/download` to `app/sitemap.ts`; add the four topic pages to `llms-full.txt` and give llms.txt links their own descriptions. Failed if: the homepage still links fewer than 15 public pages.
- M6. Titles and descriptions. Topic-page titles to about 55 characters, descriptions to about 155 (four are 163 to 195); give the 404 page its own description and a single robots tag. Failed if: Search Console shows truncated descriptions for those pages.
- M7. Trust surface. Show the $20 Pro price on every topic and use-case page; add a data and security page naming processors (Clerk, Stripe, E2B, Neon, Trigger.dev, the model providers); name the legal entity in the terms. Rests on: trust sub-scores of 8 and 12 out of 25 for two personas.
- M8. Measurement. Verify Bing Webmaster Tools and enable IndexNow; add a PageSpeed Insights or CrUX API key to the claude-seo config so Core Web Vitals and the agentic fraction can be measured; connect Search Console.
- M9. First new pages from the cluster plan, in order: `/ai-agent-human-approval`, `/integrations/gmail`, `/ai-agent-cloud-computer`, `/integrations/google-sheets`, `/ai-agent-vs-chatbot`. Link matrix and anchors: findings/cluster.md. Depends on: H2 done first so the hub is sound.

## Low (backlog)

- HSTS `includeSubDomains; preload` once all subdomains are HTTPS; a Permissions-Policy header; long `max-age` on the versioned OG image; brotli at the edge.
- Sitemap hygiene: drop `priority`, use real `lastmod` dates, decide whether /delete-account belongs in it.
- Raise contrast of dim gray secondary text to 4.5:1 with a 12 px minimum; unify "Open Krafty" and "Try Krafty free".
- Fix the homepage H1 extraction ("AI that does the workKrafty Bot" needs a separator).
- Align the Sales Outbound card (LinkedIn drafts, intent scoring) with its page; remove the non-public "product docs" citation and jargon on /autonomous-ai-agent.
- Optional draft standards: a `Content-Signal` line in robots.txt; Markdown delivery or `rel=alternate` to llms.txt; WebMCP and `/.well-known` discovery files only if those services exist.

## Info (no action)

- FAQPage on three pages: valid, but Google retired FAQ rich results for all sites on 2026-05-07. Keep it; do not add more for SERP benefit.
- `Host:` line in robots.txt is non-standard and harmless.

## Sequencing

Week 1: M1, M5, M6, M4 (except sameAs), M8 (half a day total), then start H4 and the H3 decision.
Weeks 2 to 3: H2 content rewrites, H5 assets, M3, M7.
Week 4: H1 launch week using the H5 assets, then sameAs.
Month 2: M9 new pages, M2 caching, Low backlog.
Ongoing: capture a drift baseline now, re-audit after launch week and then quarterly.
