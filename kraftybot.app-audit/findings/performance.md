# Performance findings: kraftybot.app (2026-10-27)

## Method and limits
- No Google API credentials: CrUX field data unavailable. No field LCP/INP/CLS.
- Lighthouse not measured. PSI returned "rate limit exceeded" (keyless) on repeat tries; `npx -y lighthouse@13` was blocked by the auto-mode permission classifier (downloads code). Bundled scripts cannot emit LCP/INP/CLS. So LCP, INP, CLS = NOT MEASURED. No 0-100 Lighthouse score exists.
- Measured: curl (warm-up, then 3 runs, HTTP/2, gzip) and static HTML/asset analysis. All lab/synthetic, single location (client in US, edge ord1).

## TTFB (document, warm; 3 runs)
| Page | TTFB range | Doc gz / raw |
|---|---|---|
| / | 0.18-0.23s | 95 KB / 1,069 KB |
| /how-it-works | 0.157-0.192s | 13 KB / 57 KB |
| /use-cases/sales-outbound | 0.153-0.158s | 12 KB / 53 KB |
| /manus-alternatives | 0.165-0.179s | 12 KB / 55 KB |
All good (<0.8s). Cold start after sleep NOT tested (server was warm). Mobile vs desktop identical server-side.

## Resources (gzip, transfer approximations from HTML-referenced assets)
- Homepage: 33 script chunks ~822 KB gz (~2.9 MB raw incl. a 437 KB-raw and 299 KB-raw chunk), CSS 64 KB gz (260 KB raw main sheet), 2 woff2 (23 KB + 69 KB). Approx 1.0 MB gz total before lazy loads. Some chunks may load lazily; unverified.
- Subpages: ~493 KB gz JS referenced, CSS ~56 KB gz, +fonts.
- Render-blocking: 4 stylesheets on every page (`data-precedence`, 862 B + 40 KB + ~8-14 KB + 14.5 KB gz). JS is async (not blocking).
- Images: none. Pages use 95 inline SVGs (home), 1 canvas. No raster formats to optimize. LCP element therefore likely the h1 text ("AI that does the work", `#hero-title`) - inferred, not measured.
- Fonts: 2 woff2 preloaded via Link header, immutable 1-year cache. No font-display seen in inlined CSS (next/font default is swap).
- Third parties: Clerk only (clerk.kraftybot.app first-party-proxied domain: clerk-js 84 KB gz/325 KB raw async + @clerk/ui 46 KB gz preload, ~130 KB gz on every page, signed-out). Stripe and Sentry scripts not present in HTML (Stripe only in CSP). No analytics.
- Homepage inline scripts: 73 KB (RSC payload); other pages ~37-40 KB.
- Cache: HTML no-store (per-request nonce CSP); static assets immutable. Brotli not observed (gzip served).

## Issues
1. MEDIUM - Homepage HTML 1.07 MB raw (95 KB gz), 2,470 elements: parse cost, INP/LCP risk on mobile CPUs. Fix: trim inline SVG (95) via sprite/`<use>`, lazy-render below-fold sections.
2. MEDIUM - Homepage ~822 KB gz JS; 437 KB-raw and 299 KB-raw chunks. Fix: dynamic-import the interactive chat demo and below-fold sections; analyze with `next experimental-analyze`.
3. MEDIUM - Clerk (~130 KB gz) loads on public marketing pages for signed-out visitors. Fix: load Clerk only on app/auth routes or defer until interaction; keep async.
4. LOW - 4 render-blocking CSS files, 260 KB raw main sheet (40 KB gz). Fix: purge unused CSS, split marketing CSS.
5. LOW - gzip not brotli; enable br at edge if possible.
6. INFO - TTFB excellent; cold-start impact untested.

## Top 3 fixes
1. Code-split homepage JS (-300-500 KB gz; lower INP/TBT, faster LCP on mobile).
2. Remove Clerk from marketing routes (-130 KB gz everywhere).
3. Slim homepage DOM/HTML (SVG sprite, lazy sections; -50-70% raw HTML).

## Required follow-up
Run real Lighthouse mobile+desktop (PSI with API key, or install lighthouse locally) to get LCP/INP/CLS/score; configure CrUX API key for field data.
