# Agent-readiness audit: https://kraftybot.app (2026-10-27, mode: audit)

Agent-readiness (judgement, not a Lighthouse number): 78/100. Agent-UX heuristic (separate): 84/100, status complete.

## Lighthouse Agentic Browsing
Unavailable: X/N not measured. PSI returned HTTP 429 (daily keyless quota) for all four runs (home and /use-cases/sales-outbound, mobile and desktop). No fraction is claimed. Fix: configure a Google API key (/seo google setup) and rerun.
Static proxies (agentic_check.py): server-rendered 2429 words without JS (pass); robots reachable (pass); llms.txt Lighthouse rules pass; 404 probe returns a real 404 (pass); WebMCP entry point absent; 4 forms, 0 annotated.

## Findings
P0: none. Content is server rendered, robots.txt is valid, nothing blocked.
P1 (opportunity): No Content-Signal in robots.txt or headers. Fix: add `Content-Signal: search=yes, ai-input=yes, ai-train=<your choice>` per group. Draft/preference only (Cloudflare policy + IETF draft; checked 2026-09-23 per vendor-matrix).
P1 (opportunity): No Markdown delivery. `Accept: text/markdown` on /use-cases/sales-outbound returns 200 text/html; /index.md is 404; no rel=alternate markdown. `Vary` lacks Accept. llms.txt and llms-full.txt exist as the substitute. Optional.
P2: Four fixed-purpose "Email draft" form mock inputs (to/cc/subject/body, ~12 inputs) have no label element or aria-label; the three forms carry aria-label="Email draft". The first form is disabled mock content. Fix: aria-label per field or aria-hidden/inert on the decorative demo, so agents do not read fake data (appointments@brightsmile.example) as real. This drives the -16 in the UX score.
P2: Homepage demo chat: textarea has aria-label "Message New bot" and aria-autocomplete/haspopup (good); its wrapping form has no accessible name. Fix: add aria-label="Chat demo". Demo is interactive, so confirm it does not submit to real endpoints for agents.
P3: Homepage CSP uses nonce plus 'strict-dynamic'; fine for agents, but the nonce makes pages uncacheable (cache-control no-store), only a performance note.
P3 (opportunity): WebMCP not present (no navigator.modelContext, 0 registerTool); no form annotations. Draft proposal; optional.

## Works
Landmarks: 1 main, 1 nav, 3 header, 1 footer, 1 aside, one h1; 52 buttons and 47 links, 0 div-onclick widgets, 0 unnamed interactive nodes in the accessibility tree (1045 nodes, 84 interactive). JSON-LD present. llms.txt: all 21 linked URLs resolve 200 (including llms-full.txt, #pricing anchor). Sitemap declared.

## Access policy (robots.txt, checked live)
- Training: GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, meta-externalagent, CCBot: Allow / (disallow app routes only). No Content-Signal.
- Search: OAI-SearchBot, Claude-SearchBot, PerplexityBot, Googlebot, Bingbot, Applebot, DuckAssistBot: allowed on /.
- User-triggered: ChatGPT-User, Claude-User, Perplexity-User, MistralAI-User, meta-externalfetcher: allowed on /. Vendor behaviour: Claude-User honours robots; Perplexity-User/Google-Agent generally ignore it; ChatGPT-User may not apply.
- Disallowed for all: /sign-in, /sign-up, /workspace, /usage, /memory, /activity, /chats/, /auth/, /api/.
Note: allowing training bots is an explicit choice; confirm intended.

## Absent vs broken
Broken: nothing. Absent (opportunities): Content-Signal, Markdown, WebMCP, /.well-known/ai-catalog.json, api-catalog, agent-card.json, mcp.json, oauth metadata (all 404 HTML, not catch-all 200). Not applicable unless you run those services. ai-catalog.json, WebMCP, Content-Signal are drafts/proposals (checked 2026-09-23).
Unmeasured: Lighthouse fraction (PSI quota).
