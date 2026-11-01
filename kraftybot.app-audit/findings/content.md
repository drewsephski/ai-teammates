# Content Quality and E-E-A-T: kraftybot.app

Audit date: 2026-10-27. 19 public URLs fetched (raw HTML; the homepage from the supplied Playwright render). Evidence files: `kraftybot.app-audit/pages/*.json|*.html`, parsed summary `pages/_parsed.json`. Word counts are `<main>` text (the "main" column), with trafilatura `extracted_text` as a second measure. Similarity is 5-word-shingle Jaccard; "uniqueness" is the share of a page's shingles that occur on no sibling page. Readability is Flesch Reading Ease (FRE) and Flesch-Kincaid grade, computed with a heuristic syllable counter. There is no blog.

## Scores

| Metric | Score |
|---|---|
| Content Quality (overall) | **60 / 100** |
| On-Page SEO | **72 / 100** |
| E-E-A-T (weighted) | **52 / 100** |
| AI citation readiness | **74 / 100** |

E-E-A-T breakdown (this skill's internal weights, not Google's):

| Factor | Weight | Score | Basis |
|---|---|---|---|
| Experience | 20% | 38 | No customer stories, testimonials, real screenshots or measured outcomes. All demos are labelled "Interactive example · no external actions" (honest, but illustrative only). Starter prompts are concrete and look like real operator knowledge. |
| Expertise | 25% | 60 | Mechanics are described precisely and match the code: reads free and writes held, high-risk actions can never be set to always allow, a vision-model check on clicks, 7-day approval expiry, exact plan limits. No author or byline on any content page, no docs, changelog or security page. |
| Authoritativeness | 25% | 30 | Solo founder named ("Built independently by Drew Sepeczi"; the Person schema links drewsepeczi.xyz). No sameAs profiles, press, reviews, integration-partner listings, user counts or third-party mentions. |
| Trustworthiness | 30% | 70 | Privacy policy (updated 2026-10-26), terms, a support page, a self-serve account deletion path, a named operator, explicit limits ("What it doesn't do", "What we will not claim"), and pricing that is consistent across pages. Against that: support is a personal `@gmail.com` address, with no legal entity, postal address, security or data-handling page, or subprocessor list. |

Weighted: 0.2·38 + 0.25·60 + 0.25·30 + 0.3·70 = 51.6.

## Per-page inventory

| URL | Title (chars) | H1 | Main words (extracted) | Meta desc chars | FRE / grade | Verdict |
|---|---|---|---|---|---|---|
| / | Krafty — AI agents that do the work, not just talk about it (59) | "AI that does the work" + brand mark | 2,343 (819) | 159 | 81 / 5.2 | Pass. About 60% of the words are scripted demo chat. |
| /how-it-works | How Krafty Bot works: AI teammates with a computer · Krafty (59) | How Krafty Bot works | 772 (446) | 149 | 74 / 7.3 | Pass. The strongest page on the site. |
| /ai-agents-for-business | AI agents for business · Krafty (31) | AI agents for business | 565 (397) | **173** | 64 / 9.2 | Borderline thin for a commercial landing page (800 floor). |
| /ai-employees | AI employees and AI workers · Krafty (36) | AI employees and AI workers | 416 (281) | **163** | 68 / 7.4 | Thin |
| /autonomous-ai-agent | Autonomous AI agent · Krafty (28) | Autonomous AI agent | 370 (244) | **186** | 62 / 9.0 | Thin, for a definitional query |
| /manus-alternatives | Manus alternatives · Krafty (27) | Manus alternatives | 419 (293) | **195** | 60 / 9.2 | Thin, and does not match search intent |
| /use-cases | AI teammate use cases: sales, ops, engineering · Krafty (55) | AI teammate use cases | 978 (298) | 148 | 67 / 9.0 | Pass (hub) |
| /use-cases/sales-outbound | AI agent for outbound sales (36) | same | 435 (355) | 122 | 72 / 7.5 | Thin, templated |
| /use-cases/talent-scout | AI agent for recruiting and sourcing (45) | same | 400 (327) | 118 | 69 / 8.1 | Thin, templated |
| /use-cases/paid-media | AI agent for paid media reporting (42) | same | 401 (331) | 132 | 68 / 8.0 | Thin, templated |
| /use-cases/expense-manager | AI agent for receipts and expenses (43) | same | 389 (319) | 121 | 71 / 7.7 | Thin, templated |
| /use-cases/product-performance | AI agent for performance investigations (48) | same | 397 (330) | 134 | 72 / 7.7 | Thin, templated |
| /use-cases/bug-reproduction | AI agent for bug reproduction (38) | same | 394 (325) | 114 | 69 / 7.9 | Thin, templated |
| /use-cases/account-health | AI agent for customer account health (45) | same | 397 (329) | 92 | 76 / 6.7 | Thin, templated |
| /use-cases/support-triage | AI agent for support ticket triage (43) | same | 388 (323) | 111 | 70 / 7.9 | Thin, templated |
| /use-cases/chief-of-staff | AI chief of staff for your inbox and calendar (54) | same | 411 (342) | 124 | 73 / 7.7 | Thin, templated |
| /support | Support · Krafty (16) | Krafty support | 173 | 64 | 62 / 7.9 | OK for a utility page |
| /privacy | Privacy policy · Krafty (23) | Privacy policy | 1,088 | 56 | 38 / 11.9 | OK (legal) |
| /terms | Terms of service · Krafty (25) | Terms of service | 712 | 58 | 47 / 10.2 | OK (legal) |

On-page basics that pass everywhere: unique titles, one H1 per page, self-referencing canonicals and og:url, no `noindex`, sensible H2/H3 nesting, and BreadcrumbList on inner pages. FAQPage schema is on /, the four topic pages and nowhere else. The homepage carries Organization, Person, WebSite, SoftwareApplication with Offers, and WebPage schema. llms.txt and a 20-URL sitemap are present. Visible "Updated October 26, 2026" freshness stamps appear on the topic pages and how-it-works.

`metadata_template.py` on all 19 title and description pairs: `site_risk: low`, `templated_ratio: 0.0`, `shared_cta_phrases: {}`, no flags. Metadata is not bulk-templated.

## Template similarity: the 9 use-case pages

- All 9 share one skeleton: H1, "What the Bot does", "What waits for you", "Apps and schedule", "Starter prompt", "More jobs for a Bot". Five sentences appear word for word on every page, for example "Reading your apps needs no approval.", "Anything that writes to them waits for you.", "Swap in the apps your team uses.", "A site without a connection can be opened in the Bot's browser on its cloud computer."
- Whole-page uniqueness against siblings is **45–51%**. With the "More jobs" cards excluded it rises to 61–67%.
- The hub `/use-cases` repeats each page's one-line pitch and the full starter prompt word for word. That puts 21–24% of each page's body on the hub as well. Uniqueness against siblings and hub combined is **40–45%**.
- Mean pairwise Jaccard is 0.19 and the maximum is 0.28 (bug-reproduction and product-performance). That is below a near-duplicate threshold, so this is template thinness, not duplication.
- Unique body copy per page is about 280–330 words: four bullets, one or two approval bullets, an app list, a schedule and a prompt. There is no example output, no walk-through, no "before and after", no FAQ and no time or effort numbers.
- Inconsistency: the hub and "More jobs" card for Sales Outbound promise "scores contacts by intent, drafts email **and LinkedIn**", but the page itself and its prompt cover email only. The card claim is unsupported.
- By `seo-programmatic` standards (defer there for scale rules) this set is acceptable at 9 pages, but each page needs more unique substance to rank for "AI agent for X" queries.

## Topic pages: ai-agents-for-business, ai-employees, autonomous-ai-agent (and manus-alternatives)

- Lexical overlap is very low: 5-gram Jaccard 0.02–0.04, 3-gram 0.04–0.06, and 89–93% unique against each other and how-it-works. They are **not** near-duplicates.
- Semantic overlap is high. All four restate the same five-point feature list (memory, shared cloud computer, connected apps, routines, approvals); how-it-works already covers it in more depth. Each page adds about 100–150 words that are specific to its query, for example "AI employees vs. AI workers" and "AI agent builder vs. describing a job".
- Keyword targeting is clear but mechanical. Each H1 is the exact query, and the H2s are forced keyword variants ("AI automation for small business", "AI virtual assistant for small business"). Opening lines also read as written for search: "People search for AI employees or AI workers when…". These match the QRG's low-effort pattern of content made for search (generic restatement, little original insight).
- Cannibalization risk: the homepage title ("AI agents that do the work"), /ai-agents-for-business, /autonomous-ai-agent and every use-case title ("AI agent for …") all chase "AI agent". The head term has no single clear owner.
- /manus-alternatives targets a query whose intent is a list of alternatives with a comparison. The page lists no alternatives and starts with a disclaimer. It is honest, which helps trust, but it is unlikely to satisfy or rank for the query.
- /autonomous-ai-agent refers to "approval gates described in the product docs", but no public docs exist. It also uses internal jargon: "Continuations resume a capped turn without gaining new permissions".

## Internal linking

- Inner pages are well connected. The footer links all 19 pages, topic pages cross-link through "Related pages", and use-case pages link 3 siblings, the hub and /how-it-works#approvals.
- **The homepage footer is a different, shorter component.** It links only /how-it-works, /use-cases, /ai-agents-for-business and /ai-employees. It omits /autonomous-ai-agent, /manus-alternatives and all 9 use-case pages, so 11 pages are 2+ clicks from the strongest page.
- /how-it-works links out only to /use-cases and /#pricing in its body. It never links to the topic pages or individual use cases.
- The homepage HTML is about 1.07 MB, mostly RSC payload from the demo. That is not a content issue as such, but it dilutes the text-to-HTML ratio (cross-check with the performance audit).

## AI citation readiness (74)

Strengths:
- A clean, repeated definitional sentence: "Krafty Bot is an AI workspace where you hand Bots actual tasks, not just questions…". It appears on /, /how-it-works, llms.txt and in the Organization schema.
- Quotable facts with numbers: "Pro: $20 per month for up to 50 bots, unlimited connected apps, a $10 AI allowance, and 50 hours of cloud computer time"; "Approval requests expire after seven days"; "High-risk app actions can never be set to always allow".
- FAQ blocks with FAQPage schema, comparison passages ("Compared with workflow automation"), limitation statements, and an llms.txt.

Gaps:
- /autonomous-ai-agent gives its definition in one sentence and stops. There is no list of agent types and no examples beyond Krafty.
- No original data (usage stats, time saved, benchmark of the approval guard) that an AI answer would cite as a source.
- The homepage WebPage schema `name` ("Krafty — AI teammates with memory, apps, and a cloud computer") differs from the `<title>`.

## AI-generated-content quality flags (QRG Sept 2025)

- The topic pages show the low-effort SEO pattern: query-led openers, keyword H2s, and the same feature list restated in each. The writing is still accurate and specific, with nothing fabricated, so these are **medium** flags, not spam.
- Use-case pages repeat their structure across 9 pages (expected for a library). They are rescued by the concrete prompts.
- No factual inaccuracies found against the product rules. Plan limits are consistent everywhere ($1 one-time, 5 minutes once, $20, 50 bots, 50 hours, $10 allowance). The one unsupported claim is the "LinkedIn/intent" card copy.

## Issues and fixes

| # | Severity | Issue | Evidence | Fix |
|---|---|---|---|---|
| 1 | High | Thin, templated use-case pages | 388–435 main words. 45–51% unique against siblings, 40–45% against siblings plus the hub. Identical skeleton and 5 shared sentences. | Add per-page unique blocks: a sample output (the actual brief, sheet row or email draft the Bot produces), a step-by-step first-run walk-through, 3–4 role-specific FAQs (with FAQPage schema), "what to customize" and "common pitfalls". Target 700+ unique words. On the hub, shorten each prompt to a teaser so the full prompt lives only on its own page. |
| 2 | High | Weak experience and authority evidence | No testimonials, case studies, real screenshots, user counts, sameAs or press. The founder appears only in the footer and in schema. | Publish 2–3 real or founder-run case studies with outputs and time saved. Add an /about page with the founder bio, why Krafty exists and links (GitHub, X, LinkedIn). Add `sameAs` to Organization and Person. Real screenshots of the Activity and approval screens. |
| 3 | Medium | Trust gaps | Support and privacy contact is `drewsepeczi@gmail.com`. No entity or address, no security page. | Use a domain address (support@kraftybot.app). Add a security and data page naming the processors (E2B, Clerk, model providers, Composio), OAuth scope handling and retention. Add the legal entity and jurisdiction to the terms. |
| 4 | Medium | Topic pages restate the same feature list. H2s are keyword-forced. | Every topic page repeats memory, computer, apps, routines and approvals. "AI virtual assistant for small business" as an H2. | Give each page one job. /autonomous-ai-agent: a real explainer (levels of autonomy, agent vs. workflow vs. chatbot, risks and guardrails, a worked example). /ai-employees: role-by-role cost and capacity framing. /ai-agents-for-business: industry examples and an ROI section. Replace the feature dump with one line and a link to /how-it-works. Rewrite H2s as questions people ask. |
| 5 | Medium | /manus-alternatives does not match search intent | No alternatives listed. Opens with a disclaimer. 419 words. | Either build a neutral criteria-plus-category guide (cloud-computer agents, workflow tools, chat assistants) with the factual, dated public positioning of named tools, or rename it to "Krafty vs. general agent tools" and drop the Manus head term. |
| 6 | Medium | Homepage under-links key pages | The home footer omits /autonomous-ai-agent, /manus-alternatives and all 9 /use-cases/* pages. | Use the inner-page footer on / (it already lists all 19), or link each "What would you hand off first?" tab to its /use-cases/* page. |
| 7 | Medium | "AI agent" head-term cannibalization | Home title, /ai-agents-for-business, /autonomous-ai-agent and 9 "AI agent for…" titles. | Pick an owner: home for "AI agent that does tasks" and /ai-agents-for-business for "AI agents for small business". Make /autonomous-ai-agent informational ("What is an autonomous AI agent?"). |
| 8 | Low | Topic page metadata | Titles of 27–36 chars with no differentiator. Descriptions of 163–195 chars will truncate. "without speaking for other products" is odd copy. | Titles: e.g. "AI Agents for Small Business That Do the Work · Krafty". Descriptions ≤155 chars, leading with the benefit. |
| 9 | Low | Unsupported card claim | The hub and cards say Sales Outbound "scores contacts by intent, drafts email and LinkedIn". The page covers email only. | Align the card copy to the page (or add LinkedIn to the page if true). |
| 10 | Low | Dangling reference and jargon | "described in the product docs" (none public). "Continuations resume a capped turn". | Link /how-it-works#approvals instead. Plain wording: "If a long task hits its step limit, it picks up where it left off with the same permissions." |
| 11 | Low | Schema and title mismatch | Home WebPage.name differs from `<title>`. | Make them match. |
| 12 | Info | No blog or editorial content | No informational content to earn links or build topical authority. | Start a small /guides section ("How to automate receipts with an AI agent", "AI agent approvals explained"), with author bylines and dates. |

## What works

- Honest, specific, plain-language copy, readable at grade 5–9 (FRE 60–81). Limits are stated openly ("What it doesn't do", "It reduces risk; it can't remove it").
- Pricing and plan facts are consistent across the homepage, how-it-works, topic pages, llms.txt and schema.
- The demos are clearly labelled as examples, so nothing invented is shown as real state.
- Strong structured data, canonicals, breadcrumbs, freshness stamps, llms.txt and sitemap. No templated metadata.
- The use-case starter prompts are concrete, useful and quotable: the most original content on the site.
- Inner-page internal linking is thorough.

## Structured findings (audit-data.json, category: Content Quality)

```json
{
  "category": "Content Quality",
  "score": 60,
  "on_page_seo_score": 72,
  "eeat": {"experience": 38, "expertise": 60, "authoritativeness": 30, "trustworthiness": 70, "weighted": 52},
  "ai_citation_readiness": 74,
  "metadata_template": {"site_risk": "low", "templated_ratio": 0.0, "shared_cta_phrases": {}},
  "findings": [
    {"id": "thin-templated-use-cases", "severity": "high", "urls": ["/use-cases/*"], "evidence": "388-435 words; 45-51% unique vs siblings, 40-45% vs siblings+hub; 5 identical sentences"},
    {"id": "weak-experience-authority", "severity": "high", "urls": ["/"], "evidence": "no testimonials, case studies, sameAs, about page"},
    {"id": "trust-contact-gaps", "severity": "medium", "urls": ["/support", "/privacy", "/terms"], "evidence": "gmail.com support address; no entity/address/security page"},
    {"id": "topic-pages-restated-features", "severity": "medium", "urls": ["/ai-agents-for-business", "/ai-employees", "/autonomous-ai-agent"], "evidence": "same 5-feature list on each; keyword H2s; 370-565 words"},
    {"id": "manus-intent-mismatch", "severity": "medium", "urls": ["/manus-alternatives"], "evidence": "no alternatives listed"},
    {"id": "homepage-footer-underlinks", "severity": "medium", "urls": ["/"], "evidence": "11 public pages not linked from home"},
    {"id": "ai-agent-cannibalization", "severity": "medium", "urls": ["/", "/ai-agents-for-business", "/autonomous-ai-agent"]},
    {"id": "topic-metadata-length", "severity": "low", "evidence": "titles 27-36 chars; descriptions 163-195 chars"},
    {"id": "unsupported-card-claim", "severity": "low", "urls": ["/use-cases", "/use-cases/sales-outbound"], "evidence": "LinkedIn/intent scoring not on page"},
    {"id": "dangling-docs-reference", "severity": "low", "urls": ["/autonomous-ai-agent"]},
    {"id": "home-schema-title-mismatch", "severity": "low", "urls": ["/"]},
    {"id": "no-blog", "severity": "info"}
  ]
}
```
