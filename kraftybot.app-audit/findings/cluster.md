# Semantic clustering: kraftybot.app

Date: 2026-10-27. Seed: "ai agent for small business". Method: SERP-overlap (seo-cluster thresholds: 7-10 shared = same post, 4-6 = same cluster, 2-3 = interlink, 0-1 = separate), 12 WebSearch calls, with obvious synonyms grouped by judgment. Existing page metadata read from `lib/marketing/seo-pages.ts`.

## Limits of the data

- The WebSearch tool returns about 9-10 results per query from its own index, not a live Google top 10. Overlap counts are directional.
- Synonym and modifier variants (for example "what is an ai employee" next to "ai employee") were assigned by judgment and not searched separately, to stay inside the budget.
- No search volume data was used. "Broadest" was judged from SERP breadth and modifier depth.

## 1. Keyword expansion and intent (34 queries)

| # | Keyword | Intent | Searched |
|---|---|---|---|
| 1 | ai agent for small business (seed) | Informational/Commercial | yes |
| 2 | ai agents for small business | Informational | grouped with 1 |
| 3 | best ai agents for small business | Commercial | yes |
| 4 | ai agents for business | Informational | yes |
| 5 | ai automation for small business | Commercial | judgment (with 1) |
| 6 | ai virtual assistant for small business | Commercial | judgment (with 1) |
| 7 | ai employee | Informational | yes |
| 8 | what is an ai employee | Informational | grouped with 7 |
| 9 | ai workers / ai digital worker | Informational | grouped with 7 |
| 10 | hire an ai employee | Commercial | grouped with 7 |
| 11 | autonomous ai agent | Informational | yes |
| 12 | what are autonomous ai agents | Informational | grouped with 11 |
| 13 | ai assistant that takes actions | Informational/Commercial | yes |
| 14 | ai agent vs chatbot | Informational | grouped with 13 |
| 15 | ai agent vs zapier / workflow automation | Commercial | grouped with 13 |
| 16 | ai agent with human approval | Informational | yes |
| 17 | human in the loop ai agent | Informational | grouped with 16 |
| 18 | ai agent that uses a browser | Informational/Commercial | yes |
| 19 | ai agent with its own computer / cloud computer | Commercial | grouped with 18 |
| 20 | computer use agent | Informational | grouped with 18 |
| 21 | manus alternative(s) | Commercial | yes |
| 22 | chatgpt agent alternative | Commercial | grouped with 21 |
| 23 | lindy alternative | Commercial | grouped with 21 |
| 24 | ai agent gmail | Commercial | yes |
| 25 | ai email assistant that sends replies | Commercial | grouped with 24 |
| 26 | ai agent google sheets | Commercial | yes (combined query) |
| 27 | ai agent github | Commercial | yes (combined query) |
| 28 | ai sales agent outbound prospecting | Commercial | yes |
| 29 | ai sdr for small business | Commercial | grouped with 28 |
| 30 | ai support triage agent | Commercial | judgment (role) |
| 31 | ai expense manager agent | Commercial | judgment (role) |
| 32 | ai chief of staff | Commercial | judgment (role) |
| 33 | ai bug reproduction agent | Commercial | judgment (role) |
| 34 | ai recruiting / talent sourcing agent | Commercial | judgment (role) |

Navigational queries (for example "krafty bot login", "manus ai login") were removed.

## 2. SERP overlap matrix (exact-URL matches in returned results)

| Pair | Shared URLs | Verdict |
|---|---|---|
| ai agent for small business / best ai agents for small business | 2 (nexos.ai guide, activepieces top-9 list) | Interlink |
| ai agent for small business / ai agents for business | 0 (Salesforce on both, different URLs) | Separate |
| ai agents for business / ai employee | 0 | Separate |
| ai agents for business / autonomous ai agent | 0 (peakflo.co on both, different URLs) | Separate |
| ai employee / autonomous ai agent | 0 | Separate |
| ai agent for small business / ai employee | 0 (lowcode.agency on both, different URLs) | Separate |
| autonomous ai agent / ai agent with human approval | 0 | Separate |
| ai assistant that takes actions / ai agent with human approval | 0 | Separate |
| ai assistant that takes actions / ai agent that uses a browser | 0 | Separate |
| ai agent that uses a browser / ai agent google sheets | 0 (simular.ai computer-use page appears in Sheets SERP only) | Separate |
| ai agent gmail / ai agent google sheets | 0 | Separate |
| manus alternative / ai agents for business | 0 (jotform on both, different URLs) | Separate |
| manus alternative / best ai agents for small business | 0 | Separate |
| ai sales agent outbound / ai agent for small business | 0 | Separate |

What the matrix shows: apart from the seed and its "best" modifier, every searched query has its own SERP. Google treats these as separate topics, so each needs its own URL. No pair reaches the 4+ needed to merge into a same-cluster page. That supports one page per query family rather than merging. Clusters below are therefore built on topical and intent fit plus linking, not on shared rankings. I flag this as an exception to the checklist rule "no spoke with < 4 overlap to cluster peers".

SERP character observed:
- Small business: vendor guides and listicles (nexos, Salesforce SMB, Botpress, Activepieces, Lindy, Rework). Mixed informational and commercial. Winnable with a practical, honest guide.
- AI agents for business: enterprise-leaning (Salesforce Agentforce, Hackett, Jotform, Zeni). Harder for a small SaaS.
- AI employee: definitional (Vellum, IONOS, eesel, Slack, lowcode). Informational.
- Autonomous AI agent: definitional with authority sites (TechTarget, Salesforce, arXiv, Hostinger). The "bounded autonomy / human checkpoints" angle recurs, which matches Krafty.
- Human approval: developer and vendor docs (Temporal, withHuman, StackAI, Arahi). No small-business, end-user page ranks. This is a gap.
- Browser agent: developer tools (Browser Use, Vercel agent-browser, Parallel). No "agent with its own cloud computer for non-developers" page. This is a gap.
- Gmail / Sheets agents: integration landing pages (ClickUp, Relevance, Composio, Sim, Beam) plus tutorials. Commercial. A product page format fits.
- Manus alternative: listicles plus AlternativeTo. Commercial comparison.
- Outbound sales agent: SDR vendor pages (Regie, Aircall, Smartlead). Krafty's /use-cases/sales-outbound competes on a narrower angle.

## 3. Cluster architecture

Pillar: **/ai-agents-for-business**, retargeted to the seed "ai agent(s) for small business". The "ai agents for business" SERP is enterprise-led and shares 0 URLs with the seed. Krafty's audience is small businesses and founders, so the pillar should target the seed. Keep "ai agents for business" as a secondary phrase. Moving the URL is optional and probably not worth it. If it is ever renamed to /ai-agents-for-small-business, use a 301.

| Cluster | Intent | Queries | Mapped page | Template |
|---|---|---|---|---|
| P. Pillar: AI agents for small business | Informational/Commercial | 1, 2, 4, 5, 6 (+3 as a section) | /ai-agents-for-business (retarget) | Pillar guide, 2500-4000 words |
| A. What an action-taking agent is | Informational | 7-10, 11-12, 13-15 | /ai-employees, /autonomous-ai-agent, GAP: /ai-agent-vs-chatbot (13-15) | Explainer / definition |
| B. Trust and control | Informational | 16-17, 18-20 | /how-it-works, GAP: /ai-agent-human-approval, GAP: /ai-agent-cloud-computer (browser) | Explainer with product proof |
| C. Integrations | Commercial | 24-27 | GAP: /integrations/gmail, GAP: /integrations/google-sheets, GAP: /integrations/github (an /integrations hub is optional) | Integration landing page |
| D. Alternatives and roundups | Commercial | 3, 21-23 | /manus-alternatives, later GAP: /chatgpt-agent-alternatives, /lindy-alternatives | Comparison |
| E. Roles (existing sub-hub) | Commercial | 28-34 | /use-cases plus 9 role pages (sales-outbound, support-triage, expense-manager, chief-of-staff, bug-reproduction, talent-scout, ...) | Use-case page |

Cluster E has more than 4 posts because it is an existing sub-hub. Treat /use-cases as a secondary hub under the pillar rather than nine direct spokes.

"best ai agents for small business" (2 shared URLs with the seed, interlink tier): don't build a separate listicle yet. A self-published "best of" list ranking Krafty first carries trust and quality risk, and the shared SERP means it would compete with the pillar. Cover it as a "how to choose" section in the pillar. Revisit it as its own commercial page only if the pillar ranks and the "best" query stays out of reach.

## 4. Cannibalization check

### /ai-agents-for-business vs /ai-employees vs /autonomous-ai-agent

- **SERP level: low risk.** The three head terms share 0 URLs pairwise, so Google already treats them as different intents. Keeping all three pages is justified.
- **On-page level: moderate risk.** From `lib/marketing/seo-pages.ts`:
  - All three meta descriptions list the same feature set: memory, connected apps, shared cloud computer, approvals before writes.
  - /ai-agents-for-business's description also targets "small-business automation" and "virtual assistant", which pulls in queries for which no other page exists. That part is fine. Its H1 targets the enterprise-leaning head term, though, and doesn't name the seed.
  - /ai-employees's title "AI employees and AI workers" is fine. Its lead ("agents that own ongoing work") overlaps the autonomy angle.
  - /autonomous-ai-agent describes routines, unattended turns and approvals, which overlaps /how-it-works and the proposed approval page.
- **Verdict: no merge needed. Sharpen each page's angle.**
  - /ai-agents-for-business: "AI agents for small business". Owns the pillar: which jobs to hand off, cost (free plan and $20 Pro), how to start, and a "how to choose" section. H1 and title should include "small business".
  - /ai-employees: role framing. Owns "give a Bot a job title, instructions and routines", plus AI employee vs assistant vs freelancer. Drop the generic feature list from the description.
  - /autonomous-ai-agent: definition plus bounded autonomy. Owns how much a Bot does unattended and where it stops (step and time caps, approvals). Link the approval details out to the new approval page instead of repeating them.
  - /how-it-works: product walkthrough, not a keyword target. Keep it as the conversion explainer.
- Other risks:
  - The proposed /ai-agent-human-approval page vs /how-it-works#approvals: medium. Make the new page own the query and have /how-it-works link to it with a short summary.
  - /use-cases/sales-outbound vs any future "ai sdr" page: build no separate page.

Primary keyword uniqueness: each page in the plan below has one distinct primary keyword (checked).

## 5. Internal link matrix (adjacency list)

Already in place (from seo-pages.ts): the four topic pages link to each other, the pillar links to /how-it-works, /use-cases and four role pages, and /ai-employees links to /how-it-works#approvals. Keep all of these.

Mandatory (pillar and spoke, both directions):

| From | To | Anchor text |
|---|---|---|
| /ai-agents-for-business | /ai-employees | AI employees that own a role |
| /ai-agents-for-business | /autonomous-ai-agent | how autonomous an AI agent should be |
| /ai-agents-for-business | /ai-agent-vs-chatbot (new) | AI agent vs chatbot |
| /ai-agents-for-business | /ai-agent-human-approval (new) | AI agents that ask before they act |
| /ai-agents-for-business | /ai-agent-cloud-computer (new) | an AI agent with its own computer and browser |
| /ai-agents-for-business | /integrations/gmail (new) | AI agent for Gmail |
| /ai-agents-for-business | /integrations/google-sheets (new) | AI agent for Google Sheets |
| /ai-agents-for-business | /manus-alternatives | Manus alternatives |
| /ai-agents-for-business | /use-cases | AI agent use cases for small business |
| /ai-agents-for-business | /how-it-works | how Krafty Bot works |
| every spoke above | /ai-agents-for-business | AI agents for small business |
| /use-cases and each of the 9 role pages | /ai-agents-for-business | AI agents for small business |

Recommended (within a cluster):

| From | To | Anchor text |
|---|---|---|
| /ai-employees | /autonomous-ai-agent | autonomous AI agents |
| /autonomous-ai-agent | /ai-employees | AI employees |
| /ai-agent-vs-chatbot | /ai-employees | AI employee |
| /ai-agent-vs-chatbot | /autonomous-ai-agent | autonomous AI agent |
| /autonomous-ai-agent | /ai-agent-human-approval | human approval for AI agents |
| /ai-agent-human-approval | /autonomous-ai-agent | bounded autonomy |
| /ai-agent-human-approval | /how-it-works#approvals | how approvals work in Krafty Bot |
| /how-it-works | /ai-agent-human-approval | why changes wait for your approval |
| /how-it-works | /ai-agent-cloud-computer | the shared cloud computer |
| /ai-agent-cloud-computer | /ai-agent-human-approval | risky clicks are checked first |
| /integrations/gmail | /integrations/google-sheets | Google Sheets agent |
| /integrations/google-sheets | /integrations/gmail | Gmail agent |
| /integrations/gmail | /ai-agent-human-approval | nothing is sent without your OK |
| /integrations/google-sheets | /ai-agent-human-approval | edits wait for approval |
| /manus-alternatives | /ai-agent-cloud-computer | agent with its own cloud computer |
| /use-cases | each role page | role name (already present) |

Optional (across clusters):

| From | To | Anchor text |
|---|---|---|
| /use-cases/sales-outbound | /integrations/gmail | AI agent for Gmail |
| /use-cases/support-triage | /integrations/gmail | triage your inbox with an AI agent |
| /use-cases/expense-manager | /integrations/google-sheets | AI agent for Google Sheets |
| /use-cases/product-performance | /integrations/google-sheets | update a Google Sheet automatically |
| /use-cases/bug-reproduction | /integrations/github (later) | AI agent for GitHub |
| /use-cases/bug-reproduction | /ai-agent-cloud-computer | reproduces bugs in a real browser |
| /use-cases/chief-of-staff | /ai-employees | an AI employee for your inbox and calendar |
| /ai-agent-vs-chatbot | /manus-alternatives | Manus alternatives |

Incoming-link check (at least 3 per spoke): /ai-employees (pillar, autonomous, vs-chatbot, chief-of-staff), /autonomous-ai-agent (pillar, employees, vs-chatbot, approval), /ai-agent-human-approval (pillar, autonomous, how-it-works, gmail, sheets, cloud-computer), /ai-agent-cloud-computer (pillar, how-it-works, manus, bug-reproduction), /integrations/gmail (pillar, sheets, sales-outbound, support-triage), /integrations/google-sheets (pillar, gmail, expense-manager, product-performance), /ai-agent-vs-chatbot (pillar, plus links from /ai-employees and /autonomous-ai-agent, which should be added), /manus-alternatives (pillar, vs-chatbot, existing links from the topic pages). No orphans.

## 6. Top 5 new pages, in priority order

1. **/ai-agent-human-approval**, target "ai agent with human approval" (+ "human in the loop ai agent"). Informational. The SERP is developer docs (Temporal, withHuman, StackAI), and no end-user page ranks. Approvals are Krafty's clearest difference from other agents and the main purchase worry for small businesses. It supports every other page.
2. **/integrations/gmail**, target "ai agent for gmail". Commercial. The SERP is integration landing pages plus tutorials. Gmail is the most common first job for small businesses (triage, drafts, follow-ups), and "sends nothing without your OK" sets it apart from auto-reply tools.
3. **/ai-agent-cloud-computer**, target "ai agent that uses a browser" (+ "ai agent with its own computer"). Informational/Commercial. The SERP is developer frameworks (Browser Use, Vercel agent-browser), and no product for non-developers ranks. The shared persistent cloud computer is a real product fact and also answers Manus comparisons.
4. **/integrations/google-sheets**, target "ai agent for google sheets". Commercial. 0 overlap with Gmail, so it needs its own page. The SERP is MCP and builder vendors (Composio, Sim, Beam). Krafty can rank with a page about the result for people who don't code. It links naturally from the expense-manager and product-performance roles.
5. **/ai-agent-vs-chatbot**, target "ai assistant that takes actions" (+ "ai agent vs chatbot", "ai agent vs zapier"). Informational. The SERP is fragmented (Product Hunt listings, Chatbase, IBM, a newsletter) with no strong owner. Krafty already has the "Compared with a chat assistant / workflow automation" copy in `lib/marketing/content.ts` to expand. It gives the definition pages a clear sibling that doesn't overlap them.

Next in line: /integrations/github (developer audience, links from /use-cases/bug-reproduction), /chatgpt-agent-alternatives, /lindy-alternatives. Pillar work, done before or alongside item 1: retarget the H1, title and description of /ai-agents-for-business to "AI agents for small business" and add a "how to choose" section that covers "best ai agents for small business".

Each new page must state only what the code does (`lib/marketing/content.ts` rule), use `pageMetadata`, and be added to `app/sitemap.ts`, the footer and `lib/marketing/llms.ts`.

## 7. Structured plan (JSON, Content Architecture)

```json
{
  "category": "Content Architecture",
  "seed": "ai agent for small business",
  "data_caveat": "WebSearch tool index (~9-10 results/query), not live Google top 10; 12 searches; synonyms grouped by judgment",
  "pillar": {"url": "/ai-agents-for-business", "primary_keyword": "ai agents for small business", "secondary": ["ai agents for business", "ai automation for small business", "best ai agents for small business"], "template": "pillar", "word_count": "2500-4000", "action": "retarget H1/title/description"},
  "overlap_matrix": [
    {"a": "ai agent for small business", "b": "best ai agents for small business", "shared": 2, "verdict": "interlink"},
    {"a": "ai agent for small business", "b": "ai agents for business", "shared": 0, "verdict": "separate"},
    {"a": "ai agents for business", "b": "ai employee", "shared": 0, "verdict": "separate"},
    {"a": "ai agents for business", "b": "autonomous ai agent", "shared": 0, "verdict": "separate"},
    {"a": "ai employee", "b": "autonomous ai agent", "shared": 0, "verdict": "separate"},
    {"a": "ai agent for small business", "b": "ai employee", "shared": 0, "verdict": "separate"},
    {"a": "autonomous ai agent", "b": "ai agent with human approval", "shared": 0, "verdict": "separate"},
    {"a": "ai assistant that takes actions", "b": "ai agent with human approval", "shared": 0, "verdict": "separate"},
    {"a": "ai assistant that takes actions", "b": "ai agent that uses a browser", "shared": 0, "verdict": "separate"},
    {"a": "ai agent that uses a browser", "b": "ai agent google sheets", "shared": 0, "verdict": "separate"},
    {"a": "ai agent gmail", "b": "ai agent google sheets", "shared": 0, "verdict": "separate"},
    {"a": "manus alternative", "b": "ai agents for business", "shared": 0, "verdict": "separate"},
    {"a": "manus alternative", "b": "best ai agents for small business", "shared": 0, "verdict": "separate"},
    {"a": "ai sales agent outbound prospecting", "b": "ai agent for small business", "shared": 0, "verdict": "separate"}
  ],
  "clusters": [
    {"id": "A", "name": "What an action-taking agent is", "intent": "informational", "posts": [
      {"url": "/ai-employees", "primary_keyword": "ai employee", "status": "existing", "template": "explainer"},
      {"url": "/autonomous-ai-agent", "primary_keyword": "autonomous ai agent", "status": "existing", "template": "explainer"},
      {"url": "/ai-agent-vs-chatbot", "primary_keyword": "ai assistant that takes actions", "status": "gap", "template": "comparison-explainer", "word_count": "1200-1800"}]},
    {"id": "B", "name": "Trust and control", "intent": "informational", "posts": [
      {"url": "/how-it-works", "primary_keyword": null, "status": "existing", "template": "product-walkthrough"},
      {"url": "/ai-agent-human-approval", "primary_keyword": "ai agent with human approval", "status": "gap", "template": "explainer", "word_count": "1200-1800"},
      {"url": "/ai-agent-cloud-computer", "primary_keyword": "ai agent that uses a browser", "status": "gap", "template": "explainer", "word_count": "1200-1800"}]},
    {"id": "C", "name": "Integrations", "intent": "commercial", "posts": [
      {"url": "/integrations/gmail", "primary_keyword": "ai agent for gmail", "status": "gap", "template": "integration-landing", "word_count": "1200-1800"},
      {"url": "/integrations/google-sheets", "primary_keyword": "ai agent for google sheets", "status": "gap", "template": "integration-landing", "word_count": "1200-1800"},
      {"url": "/integrations/github", "primary_keyword": "ai agent for github", "status": "gap-later", "template": "integration-landing"}]},
    {"id": "D", "name": "Alternatives", "intent": "commercial", "posts": [
      {"url": "/manus-alternatives", "primary_keyword": "manus alternative", "status": "existing", "template": "comparison"},
      {"url": "/chatgpt-agent-alternatives", "primary_keyword": "chatgpt agent alternative", "status": "gap-later", "template": "comparison"}]},
    {"id": "E", "name": "Roles (sub-hub)", "intent": "commercial", "hub": "/use-cases", "posts": [
      "/use-cases/sales-outbound", "/use-cases/support-triage", "/use-cases/expense-manager", "/use-cases/chief-of-staff", "/use-cases/bug-reproduction", "/use-cases/talent-scout", "/use-cases/paid-media", "/use-cases/product-performance", "/use-cases/account-health"], "note": "exceeds 4-post cap; existing sub-hub under pillar"}
  ],
  "cannibalization": {"pages": ["/ai-agents-for-business", "/ai-employees", "/autonomous-ai-agent"], "serp_risk": "low (0 shared URLs pairwise)", "on_page_risk": "moderate (identical feature lists in meta descriptions; pillar H1 targets enterprise head term)", "verdict": "keep all three; differentiate angles; no merge"},
  "priorities": ["/ai-agent-human-approval", "/integrations/gmail", "/ai-agent-cloud-computer", "/integrations/google-sheets", "/ai-agent-vs-chatbot"]
}
```

## Sources (SERPs sampled)

nexos.ai, salesforce.com/blog/ai-agent-for-small-business, activepieces.com, botpress.com, lindy.ai, rework.com, jotform.com, thehackettgroup.com, zeni.ai, vellum.ai, ionos.com, eesel.ai, slack.com, techtarget.com, hostinger.com, mercor.com, alternativeto.net, happycapy.ai, myclaw.ai, clickup.com, arcade.dev, relevanceai.com, robylon.ai, chatbase.co, ibm.com, parallel.ai, olostep.com, docs.temporal.io, producthunt.com (withHuman), stackai.com, regie.ai, aircall.io, smartlead.ai, composio.dev, sim.ai, beam.ai, freecodecamp.org.
