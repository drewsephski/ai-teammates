# Technical SEO audit: https://kraftybot.app (2026-10-27)

Score: 86/100. PSI/Lighthouse was rate limited, so Core Web Vitals are source-based only (no LCP/INP/CLS numbers).

## Pass/fail
- Crawlability: PASS. robots.txt declares /sitemap.xml; sitemap_discovery.py validated it (urlset, 200). Signed-in paths return 307 to sign-in with `x-robots-tag: noindex, nofollow`.
- Indexability: PASS. All 20 public URLs are 200 with a self-referencing absolute canonical, no robots meta and no X-Robots-Tag. Titles and descriptions are unique across all 20 (no duplicates).
- Titles: PASS. Homepage title is "Krafty — AI agents that do the work, not just talk about it" (55 chars, not empty). Inner pages follow "<topic> · Krafty".
- Security: PARTIAL. HTTPS enforced; HSTS max-age=31536000; X-Content-Type-Options nosniff; X-Frame-Options DENY; frame-ancestors 'none'; Referrer-Policy strict-origin-when-cross-origin; per-request CSP nonce.
- URL structure: PASS. Lowercase, hyphenated, no trailing slash. /how-it-works/ gives 308 to the no-slash URL. /HOW-IT-WORKS and /index.html give 404.
- Redirects: http://kraftybot.app/ gives 301 to https in 1 hop. www is not redirected to the apex (see M1).
- Mobile: PASS. `width=device-width, initial-scale=1` on all pages. Web manifest, apple-touch-icon and icons present.
- JS rendering: PASS. Server-rendered; render_page.py reports is_spa=false, 0 console errors, extracted text (4,427 chars) identical raw vs rendered.
- Status codes: all 20 sitemap URLs return 200. /nope-404-xyz returns a true 404 with `noindex`.
- Structured data: PASS. Homepage JSON-LD is valid (Organization, SoftwareApplication, FAQPage, Offer, ...). Marketing pages carry 2 JSON-LD blocks; legal and support pages have none (fine).
- IndexNow: no key file checked (low priority; Google-focused).

## Issues
- HIGH H1. Homepage HTML is 1,068,730 bytes raw (95 KB gzip). 95 inline SVGs account for 862 KB. Inner pages are 38-68 KB. Risk to LCP/TTFB on mobile and to Googlebot's HTML processing. Fix: move large SVGs to static files or a sprite and lazy-render the below-fold ones.
- MEDIUM M1. https://www.kraftybot.app/ returns 200 with canonical to the apex instead of a 301. Fix: 301 www to apex at Railway or the DNS layer.
- MEDIUM M2. Public pages send `cache-control: private, no-cache, no-store` (forced by the per-request CSP nonce in the root layout). Static marketing pages are never CDN-cached. Consider a nonce-free CSP on marketing routes, or hashed scripts.
- MEDIUM M3. CSP weakens its own strictness: script-src has 'unsafe-inline' (ignored with nonce plus strict-dynamic, so harmless in modern browsers), but connect-src, frame-src, img-src and media-src include bare `https:`. Fix: list the needed origins only.
- LOW L1. HSTS lacks `includeSubDomains; preload`. Add it once all subdomains (for example clerk.kraftybot.app) serve HTTPS.
- LOW L2. No Permissions-Policy header. Add a minimal one.
- LOW L3. Meta descriptions over 160 chars: /manus-alternatives (195), /autonomous-ai-agent (186), /ai-agents-for-business (173), /ai-employees (163). Trim to 150-160. Legal and support descriptions are thin (56-68 chars); acceptable.
- LOW L4. The 404 page reuses the homepage meta description and has two duplicate `robots noindex` tags. Harmless; tidy.
- LOW L5. og:image (/brand/krafty-social-v1.jpg) is served with `cache-control: public, max-age=0`. Set a long max-age, because the filename is versioned.
- INFO. Homepage canonical and og:url have no trailing slash (https://kraftybot.app), which is consistent and fine. Clerk script preload is duplicated on the homepage. Static chunks are cached immutable for 1 year (good).

## Core Web Vitals (source signals only)
- LCP: no <img> tags on the homepage, so the LCP element is text or SVG. The risk is the 1 MB HTML and 29 external scripts (28 async/defer). Fonts are preloaded.
- INP: 33 scripts, 73 KB inline (66 KB is the RSC flight payload). Moderate hydration cost; run a field check in CrUX/PSI later.
- CLS: no unsized images present. Low risk.
