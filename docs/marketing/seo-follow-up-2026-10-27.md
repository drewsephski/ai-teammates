# Krafty SEO follow-up — October 27, 2026

## Implemented locally

- Manus comparison: four separate alternatives; Manus Desktop is a separate before-switching section. Titles, descriptions, summary, and related-page text agree.
- Download title distinguishes available Android downloads from the upcoming iPhone app.
- Support includes Android and iPhone previews, and uses platform-neutral mobile deletion instructions.
- Animated characters reuse their visible outline for clipping with SVG `use`, instead of repeating the path. Native SVG circles replace two hidden, 96-segment circular paths per character. Morphing changes a single outline, keeping the clipping shape in sync.

## Search Console: verified live

Property: `sc-domain:kraftybot.app` (owner access through OpenSEO).

The domain property's Sitemaps screen initially listed no submitted sitemaps. Submitted `https://kraftybot.app/sitemap.xml` through Search Console. Readback: **Success**, submitted and last read October 27, 2026, **25 discovered pages**. Sitemap submission is not a guarantee of indexing.

Inspected all 25 sitemap page URLs through the URL Inspection API: **19 indexed**, **6 discovered, currently not indexed**. All indexed pages had matching declared and Google-selected canonicals. The six awaiting indexing:

- `/ai-teammates`
- `/ai-agent-human-approval`
- `/ai-agent-vs-chatbot`
- `/grokbot-alternatives`
- `/support`
- `/delete-account`

The homepage, `/manus-alternatives`, `/ai-agents-for-business`, and all nine role pages are indexed. Inspection reports Google's stored crawl state, not a live test of these local edits. Inspecting the sitemap XML itself as a page is not a sitemap-submission check.

## Search performance and content decisions

Final Search Console data, September 27–October 24, 2026 (Pacific dates):

| Page                      | Impressions | Clicks | Average position |
| ------------------------- | ----------: | -----: | ---------------: |
| Homepage, HTTPS canonical |          28 |      0 |             13.0 |
| Download                  |           6 |      0 |              3.8 |
| How it works              |           5 |      0 |              5.4 |
| Use cases                 |           5 |      0 |              5.6 |
| Sales outbound            |           3 |      0 |              8.3 |
| Bug reproduction          |           3 |      0 |              8.7 |
| Expense manager           |           3 |      0 |              5.7 |

All 18 returned page rows had zero clicks; the API reported no more rows. Page-impression rows should not be summed to claim a property-level impression total. Query-plus-page rows are privacy-filtered and do not account for all page impressions: `krafty` had 5 homepage impressions, `crafty ai` had 1; the other two returned query rows were sign-in traffic.

There is too little data to select a winning topic or diagnose low CTR. A few impressions at positions 5–9 do not establish commercial demand. Prioritize improving existing pages over adding another definition-page cluster. Keep sales outbound and support triage as provisional commercial walkthrough targets, based on product fit, **not a proven conversion winner**. Support triage is indexed but had no page row in the returned performance window; absence does not prove zero demand.

Search Console provides search clicks and impressions, not product conversions. No GA integration or organic landing-page conversion instrumentation was found in the inspected app source. Google Analytics connection is pending; conversions are **unknown**, not zero. Once available, join organic sessions and signup/activation/paid conversion counts to canonical landing pages. Never attribute a purchase directly to an individual search query from aggregated Search Console data.

Next decision window: compare the next complete 28 days with this baseline, allowing Search Console reporting lag. For pages with meaningful impressions, assess query intent, position, and CTR together. For pages with organic sessions, prioritize demonstrated signup/activation conversion and commercial relevance. Do not expand content solely because of a handful of impressions.

## Approved animated walkthroughs

The user approved both exact shotlists on October 27, 2026: two 20-second animations, each in 16:9 and separately composed 9:16, actual Krafty UI, charcoal/teal, the real font, synthesized music/SFX, and no voiceover. These are disclosed sample-data demonstrations, not customer recordings or measured outcomes. Existing RolePhone, EmailDraftCard and ApprovalCard markup is rendered offline; no connected-app writes or model calls occur while producing the films.

Project sources and review records:

- `videos/krafty-sales-walkthrough-20261027/`
- `videos/krafty-support-walkthrough-20261027/`

Both commercial role pages now include a poster, a user-initiated player, sample-data disclosure, captions, and a server-rendered transcript. The player creates no video element or MP4 URL until Play is pressed. It selects the portrait film below 641px and starts muted with ordinary video controls. A failed download explains the problem and offers a retry. The four final exports, final audio/codec checks, and desktop/mobile viewport playback verification are recorded in `role-walkthroughs-2026-10-27.md`. All changes remain local and uncommitted; nothing has been released.

## Performance method

Production baseline: Lighthouse 13.0.1, mobile defaults, performance category, headless Chrome, fresh run against `https://kraftybot.app/`.

- Performance: 41/100
- FCP: 3.0 seconds
- LCP: 10.1 seconds
- Total blocking time: 1,070 milliseconds
- CLS: 0
- Speed Index: 6.6 seconds

Controlled server-render comparison of the same 60 animated-character components (20 each of blob, egg, and gem; compact): 1,112,409 bytes before and 419,347 after, **62.3% less character markup**. This is an isolated component comparison, not a whole-page network transfer or Core Web Vitals improvement claim.

Raw baseline and local measurement artifacts are in `.artifacts/seo-follow-up/`. Local production results, when available, use development Clerk keys and loopback networking; compare cautiously with Railway production. Only a post-release production rerun can establish the release's user-facing performance change. No release is authorized by these local fixes.

## Local production verification

`pnpm build`, `pnpm typecheck`, file-scoped ESLint, and `pnpm test` passed. `pnpm test` passed all 898 tests with the normal command after rendering completed. The suite runs without live accounts, network, or model calls. Added regression checks for distinct comparison vendors and for two independently animated SVG clips following their own outlines, thinking dots, and reduced-motion reset.

The edited homepage served 537,122 bytes of HTML, including 324,018 bytes of SVG markup across the same 96 SVGs. The original live response was about 1.07 MB with about 863 KB of SVG markup. These are uncompressed response sizes; environments differ, so the isolated component test above is the controlled measure.

Local production mobile Lighthouse: **47/100**, FCP **3.8s**, LCP **8.2s**, total blocking time **620ms**, CLS **0**, Speed Index **6.5s**. This remains below a good performance score. It is not a production before/after claim: local networking, development Clerk keys, machine load and build state differ. Production must be rerun after an explicitly authorized release.

The mobile final screenshot was inspected; the hero, character and demo remained visible. No live product actions were taken. Build artifacts are in `.artifacts/seo-follow-up/`.

Design hook findings concerned pre-existing values in untouched `app/download/download.module.css`; no CSS values were changed or suppressions added. The existing DESIGN.md sidecar freshness warning also remains untouched.
