# Getting kraftybot.app in front of buyers — October 30, 2026

Working list from the "SEO maxxing with Claude" tactic ranking (borjafat, Oct 27, 2026), applied to Krafty. Code changes from this pass are listed first; everything after "Needs Drew" is outward-facing and waits for a person.

## Shipped in code (uncommitted until released)

| Tactic (tier)                                                                 | Change                                                                                                                                                  |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compare products on the same criteria (S); get into the lists buyers read (A) | `/best-ai-agents-small-business`: eight agents on the same five questions, vendor facts from their own sites with dates, fit notes, no scores           |
| Target a specific buyer and use case (S); topical authority (S)               | `/ai-personal-assistant` hub (5,400/mo US, KD 18 per Oct 27 research) linking the chief-of-staff, email-assistant and expense spokes                    |
| Build free tools that earn links (A)                                          | `/time-cost-calculator`: free, client-side, formula shown, copyable link HTML, `WebApplication` structured data; logic in `lib/time-cost.ts` with tests |
| Show who is behind the content (B)                                            | `/about` page, "By Drew Sepeczi" byline on every guide linking to it, `author` in each guide's `WebPage` JSON-LD, About in both footers                 |
| Make important pages accessible (B)                                           | New pages in sitemap, footers, `llms.txt`, Markdown copies and the docs MCP server; `marketingUpdated` bumped to 2026-10-30                             |
| IndexNow (B/D)                                                                | Key file `public/ccab846661cb425f9480bb780815b367.txt` for OpenSEO's IndexNow (Bing, Yandex and others; not Google)                                     |

## After the release

1. Submit to IndexNow through OpenSEO (`submit_indexnow_urls`, project `kraftybot.app`): the four new URLs plus `/grokbot-alternatives` and `/ai-teammates`.
2. Search Console → URL Inspection → Request indexing for `/grokbot-alternatives` (discovered, not indexed on Oct 30), `/ai-teammates` (unknown to Google on Oct 30), and the four new pages. The API can't request indexing; it's a button in the UI.
3. Recheck index status in a week with `inspect_urls`.

## Needs Drew: outreach already written

Seven Gmail drafts from Oct 28 are still unsent: agentsthatwork.ai, jonjones.ai, agentic.ai, makers.page, agentsindex.ai, tulimoa.com, toolsandagents.com. Six pitches were sent on Oct 28 (coursiv.io, helio.im, agenta.ai, vellum.ai, trydock.ai, rindax.com); check for replies before following up.

## Needs Drew: free listings (sign-in required)

Source: SubmitMyStartup's tested list (data generated Oct 26, 2026). Free, no badge needed, live within a day:

- General: Indie Hackers product page, Crunchbase company profile, Clapstorm, Cloudfindr, Shipyard HQ, StackShare, Tools NoCode, Votekicker, LaunchBert, Open Makers, Tech Directory, Startup Europe.
- AI-specific: AISO Tools, AI Agents Marketplace (TrillionAgent; the contact email is public), Every AI (no edits after submitting), FutureStack (800-character description below), Hot100, AI Tools Zone, LLM Relevance (small-business tools; no query parameters in the URL).
- Communities: r/SideProject ("Krafty Bot - AI teammates that do the work in your apps"), r/IMadeThis. Post what was built and what it can't do, not a pitch.
- Badge required (decide first whether footer badges are acceptable): AI Agents Directory, Thank John, AgentWork.Tools, AIMonstr.

Add each live profile Krafty controls to `brandProfiles` in `lib/marketing/site.ts` so the Organization's `sameAs` picks it up.

## Needs Drew: A-tier link work

- Pitch the time cost calculator to guides about delegation, hiring a VA, or small-business productivity ("offer the tool to relevant guides"). One sentence on what it answers, the URL, and the link HTML from the page.
- Answer reporter requests on Qwoted about AI agents for small business, citing `/ai-agent-human-approval` and the roundup's method.
- Complete G2 and Capterra profiles once there are real users to ask for reviews; never seed reviews.

## Listing copy

Use only these facts; they match the code on Oct 30, 2026.

- **Name:** Krafty Bot (company: Krafty). Never "Kraftybot".
- **URL:** https://kraftybot.app
- **Tagline, 60 characters max:** AI teammates that do the work in your apps (42)
- **Tagline, 55–95 characters:** Hand tasks to AI Bots that work in your apps and ask before sending anything (76)
- **Category:** AI agents / productivity / small business
- **Pricing:** Free plan (one Bot, one connected app, a one-time $1 AI allowance, 20 minutes of computer time). Pro $20 a month.
- **Short description (about 300 characters):** Krafty Bot is an AI workspace where you hand tasks to Bots and they do them. Each Bot has its own memory, works in the apps you connect, shares a persistent cloud computer with a browser, runs routines on a schedule, and asks before it sends, posts, or changes anything.
- **Long description (over 800 characters):** Krafty Bot is an AI workspace for founders and small teams who want work done in the apps they already use, without building workflows. You describe a job in plain language and a Bot does it: triaging Gmail and drafting replies, preparing a morning brief from your inbox and calendar, filing receipts into a spreadsheet, researching accounts, or triaging support tickets. Each Bot has its own name, role, working instructions, and memory. All Bots on an account share one persistent cloud computer with a desktop and browser, so files and sign-ins carry over, and a Bot can use a website when there's no integration. Bots run routines on a schedule or when something happens in a connected app, work together in group chats, and keep going after you close the browser. Every write to a connected app waits for your approval unless you choose to always allow that action for that Bot; sending and posting always ask, and a separate model checks each click on the computer against a screenshot. Each reply shows what it cost. There is a free plan to try one job, and Pro is $20 a month.

## Not done, and why

- AI visibility checks (B tier "find gaps in AI recommendations"): OpenSEO has 1 credit left and its prompt research needs a paid plan.
- Page friction (D tier): mobile Lighthouse was 41 with a 10.1 s LCP on Oct 27. Worth a dedicated pass on the home page's animation weight.
- A public pricing page: `/pricing` is the signed-in billing page and redirects visitors to `/#pricing`. The home page section and `/pricing.md` carry prices and limits, so this was left alone.
- YouTube, LinkedIn articles, carousels, parasite SEO, local SEO: need Drew's accounts and voice; local SEO doesn't fit an online product.
