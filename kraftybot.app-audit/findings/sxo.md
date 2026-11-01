# SXO findings: kraftybot.app

Date: 2026-10-27. Scope: 4 topic pages (/ai-agents-for-business, /ai-employees, /autonomous-ai-agent, /manus-alternatives), 2 use-case pages (/use-cases/sales-outbound, /use-cases/support-triage), with the homepage for context.
The **SXO Gap Score** is separate from the SEO Health Score.

## Key finding: page type does not match what Google ranks

All six target queries return informational or comparison SERPs. Blog guides, glossary definitions, "best X" listicles and alternative directories fill 75-100% of the organic results we could see. kraftybot.app answers every query with a short single-vendor product page (Hybrid/Landing type). The worst case is `/manus-alternatives`: every result we saw lists several tools, while Krafty's page says "We do not publish side-by-side scores against Manus or other vendors". The search intent asks for a list, and the page declines to give one.

## 1. Target pages (rendered via render_page.py --mode auto; none were SPA shells)

| Page | Title | Main-text words* | H2s | Schema | img/video | CTA | Taxonomy type |
|---|---|---|---|---|---|---|---|
| / | Krafty — AI agents that do the work, not just talk about it | 819 | 10 | SoftwareApplication, Offer, Organization, WebSite, FAQPage | 0/0 | Try Krafty free / Create your first Bot | Landing Page |
| /ai-agents-for-business | AI agents for business · Krafty | 397 | 7 | WebPage, FAQPage, BreadcrumbList | 0/0 | Start free / Get started | Hybrid (product-led) |
| /ai-employees | AI employees and AI workers · Krafty | 281 | 7 | WebPage, FAQPage, BreadcrumbList | 0/0 | Start free | Hybrid (product-led) |
| /autonomous-ai-agent | Autonomous AI agent · Krafty | 244 | 6 | WebPage, FAQPage, BreadcrumbList | 0/0 | Start free | Hybrid (definition-led, thin) |
| /manus-alternatives | Manus alternatives · Krafty | 293 | 6 | WebPage, FAQPage, BreadcrumbList | 0/0 | Start free | Single-product page (Hybrid), no comparison |
| /use-cases/sales-outbound | AI agent for outbound sales · Krafty | 355 | 5 | WebPage, BreadcrumbList | 0/0 | Create this Bot free | Hybrid / use-case landing |
| /use-cases/support-triage | AI agent for support ticket triage · Krafty | 323 | 5 | WebPage, BreadcrumbList | 0/0 | Create this Bot free | Hybrid / use-case landing |

*Word counts come from trafilatura's main-text extraction, so they are approximate. All pages show "Updated October 26, 2026". None has an author byline, a testimonial, a screenshot or a video. The four topic pages share one template: definition → what you get → FAQ → Related pages → "Try an AI teammate".

## 2. SERP analysis (6 WebSearch queries, about 9-10 organic results each)

| Query | Results seen (classified) | Dominant type (confidence) | Krafty type | Mismatch |
|---|---|---|---|---|
| ai agents for business | zeni.ai blog, Hackett glossary, peakflo blog, Salesforce Agentforce page, Google Groups post, debutinfotech blog, ipsnews "7 essential" listicle, analyticsinsight "Complete Guide" | Blog/guide (~78%), 1 vendor hybrid | Hybrid product page | **HIGH** |
| ai employees | lindy.ai guide, eesel.ai guide, Slack blog x2, vellum "best AI employees", sista solution page, arcadian guide, sista insight, nocobase feature page, podcast | Blog/guide (~60%), comparison 10%, vendor pages 20% | Hybrid product page | **HIGH** |
| autonomous ai agent | arXiv paper, Hostinger tutorial x2, peakflo, TechTarget definition x2, Supermicro glossary, Salesforce guide, Mercor explainer | Definitional guide/glossary (~100%) | Thin definitional hybrid (244 words) | **MEDIUM** (type is close, depth is far off) |
| manus alternatives | vellum "best", AlternativeTo x2, Jotform "Top 5", eesel "6 best", vantaige x2, softwares.com, happycapy | Comparison/listicle/directory (100%) | Single-product page that declines to compare | **CRITICAL** |
| ai sales outbound agent | TechTarget x2, Smartlead "Complete Guide", Salesforge x2 (roundups naming 11x, AiSDR, Apollo, Clay), Regie use-case page, JustCall blog, Landbase blog, Ringg use-case page | Blog/guide + roundup (~78%), vendor use-case pages 22% | Use-case product page | **HIGH** |
| ai support triage | NCBI/PMC x2, Acta Medica x3 (clinical ED triage), aidbase blog, appmaster guide, eesel "8 best tools", ThinkPalm case study | Split intent: clinical research ~55%, support-ticket guides/listicle ~45% | Use-case product page | **HIGH** (ambiguous query, plus type mismatch on the support side) |

What the SERPs show:
- Vendors get into these results by publishing guides, not product pages. Salesforce, Lindy, eesel, Vellum, Smartlead and Salesforge all rank with blog or guide URLs. eesel ranks for both "manus alternatives" and "support triage" with "N best tools" listicles that include eesel itself.
- The results are full of entity terms that Krafty's pages leave out: RPA vs agents, levels of autonomy, governance and risk, competitor names (11x, AiSDR, Apollo, Clay, Flowith, Genspark, ChatGPT Agent), and triage sub-jobs (intent, sentiment, priority, routing).
- AlternativeTo and softwares.com directories hold 3 of the 9 "manus alternatives" spots. Krafty only reaches that SERP if it is listed on those directories.

## 3. User stories (3 per intent, each tied to a SERP signal)

**ai agents for business**
1. As an SMB owner new to agents, I want a plain definition and departmental examples so I can tell whether this applies to me. (Signal: definition-led guides from zeni, Hackett and analyticsinsight; finance/support/sales/HR use lists.)
2. As an operator, I want evidence of ROI before I try anything. (Signal: cited McKinsey adoption stats and "30% cost" claims in the top results.)
3. As a buyer, I want to know which tools to consider. (Signal: zeni's "which to consider" and the ipsnews "7 essential" listicle.)

**ai employees**
1. As a founder, I want to know whether an "AI employee" is real or just marketing. (Signal: eesel's skeptical framing and Sista's "Can you actually hire" article.)
2. As a manager, I want to see role examples (SDR, support, bookkeeper) so I can map them to my own gaps. (Signal: Sista's role list and Lindy's cross-app workflow description.)
3. As an evaluator, I want a ranked list of AI-employee products. (Signal: vellum "best AI employees".)

**autonomous ai agent**
1. As a learner, I want a precise definition with levels of autonomy. (Signal: the arXiv six-axis framework and five-level scale, plus TechTarget's definition.)
2. As a risk-aware buyer, I want to understand error propagation, security and governance. (Signal: risk sections across the results and "bounded autonomy" framing.)
3. As a shortlister, I want to know which vendors offer autonomous agents. (Signal: TechTarget's "which vendors offer them".)

**manus alternatives**
1. As a dissatisfied Manus user frustrated by invite-only access and credit pricing, I want options with open signup and predictable pricing. (Signal: complaints repeated across the roundups.)
2. As a comparer, I want a table of price, free tier and strengths. (Signal: every result is a list or directory; softwares.com compares prices.)
3. As a privacy-minded user, I want to know where my data runs. (Signal: Vellum's local-first angle and AlternativeTo's NanoClaw entry.)

**ai sales outbound agent**
1. As a founder doing my own sales, I want to know which outbound tasks an agent can own and which need a human. (Signal: Landbase's hybrid model and Salesforge's "full process vs one part".)
2. As a buyer, I want to compare named SDR agents. (Signal: Salesforge's 2026 roundup listing 11x, AiSDR, Apollo and Clay.)
3. As a skeptic, I want to tell real agents apart from rebranded mail merge. (Signal: Smartlead's "AI-powered gets slapped on everything".)

**ai support triage**
1. As a support lead, I want a tool that categorizes, prioritizes and routes tickets. (Signal: eesel's four core triage jobs.)
2. As a cautious lead, I want a human-approval model for replies. (Signal: appmaster's human-in-the-loop guide.) Krafty's approval gate fits this story well.
3. As a buyer, I want a shortlist of triage tools. (Signal: eesel "8 best AI tools for support ticket triage".)

## 4. SXO Gap Score per page (Page Type 15 / Depth 15 / UX 15 / Schema 15 / Media 15 / Authority 15 / Freshness 10)

| Page | Type | Depth | UX | Schema | Media | Auth | Fresh | **Total** |
|---|---|---|---|---|---|---|---|---|
| /ai-agents-for-business | 6 | 4 | 11 | 9 | 2 | 3 | 9 | **44** |
| /ai-employees | 6 | 3 | 11 | 9 | 2 | 3 | 9 | **43** |
| /autonomous-ai-agent | 9 | 3 | 10 | 9 | 2 | 3 | 9 | **45** |
| /manus-alternatives | 2 | 3 | 10 | 7 | 2 | 4 | 9 | **37** |
| /use-cases/sales-outbound | 6 | 5 | 12 | 5 | 2 | 3 | 9 | **42** |
| /use-cases/support-triage | 5 | 5 | 12 | 5 | 2 | 3 | 9 | **41** |

Evidence:
- **Depth.** The pages have 244-397 words of main text. Ranking guides cover definitions, types, risks, examples and vendor lists; going by the titles ("Complete Guide", "8 best"), they are likely 1,500+ words, but we did not measure them.
- **UX.** Headings are clear and CTAs are visible. The use-case pages have a concrete "What waits for you" section and a starter prompt, which is good. The topic pages show no prices: Pro at $20 appears only on the homepage.
- **Schema.** The topic pages have FAQPage and BreadcrumbList. Google shows FAQ rich results only for authoritative government and health sites, so FAQPage earns no SERP feature here. There is no SoftwareApplication or Offer schema, no Article schema with author, and no ItemList on /manus-alternatives. The use-case pages have no FAQ.
- **Media.** None of the 7 pages has an `<img>` or `<video>`. There are no product screenshots, no demo of the approval flow, and no sample outputs (a drafted email, a triaged ticket).
- **Authority.** No author, no customer evidence, no third-party mentions. The domain is new and competes with Salesforce, TechTarget, Slack and arXiv.
- **Freshness.** All pages are dated October 26, 2026, which is good.

## 5. Persona scoring (Relevance / Clarity / Trust / Action, 25 each). Weakest persona first.

| Persona | Rel | Clar | Trust | Action | Total |
|---|---|---|---|---|---|
| Developer checking capability and safety | 14 | 13 | 12 | 13 | **52** |
| Small-business owner worried about cost and risk | 16 | 14 | 8 | 17 | **55** |
| Solo founder evaluating tools | 15 | 17 | 9 | 20 | **61** |

- **Developer (52).** The approvals model is described accurately: writes wait, "Bots do not receive your passwords in chat". But no page links to docs, a security or data-handling page, the sandbox isolation model, rate or step limits, or what the computer guard enforces. The topic pages are generic, and there's no API or architecture link. *Fix:* add a "How it's enforced" block linking to a public safety page (based on the "What is enforced" section of docs/autonomy.md), and name the cloud computer's isolation and per-turn limits on /autonomous-ai-agent.
- **SMB owner (55).** /ai-agents-for-business speaks to small business, but cost appears only as "free plan includes one Bot and one connected app". The $20 Pro price, usage allowance and what happens at the limit are missing. There are no testimonials or case studies, and repo policy rightly forbids inventing them. *Fix:* add a pricing strip derived from `planLimits` to every topic and use-case page, plus a short "what can go wrong and how Krafty stops it" list. Add real customer quotes only when they exist.
- **Solo founder (61).** The best-served persona: CTAs are clear and the free start is obvious. But this persona is in comparison mode (see the user stories) and gets no named alternatives or comparison table. *Fix:* see recommendation 1.

## 6. Why a well-written product page can still fail to rank here

1. **Intent comes before quality.** Google first decides what kind of page serves a query. For all six queries it chose guides, definitions and multi-vendor lists. A product page is filtered out at that step, however good its copy.
2. **"Alternatives" implies several options.** A page that refuses to compare cannot satisfy "manus alternatives". Google ranks third-party directories and listicles there, and Krafty is not listed in them.
3. **Thin entity coverage.** At 250-400 words the pages leave out the sub-topics and entities that ranking pages share: RPA vs agents, levels of autonomy, governance and risk, named competitors, and triage sub-tasks.
4. **Authority gap.** A new domain with no author, no third-party citations and no backlinks is up against Salesforce, TechTarget, Slack, Lindy and arXiv.
5. **Templated near-duplicates and cannibalization.** /ai-agents-for-business, /ai-employees and /autonomous-ai-agent share one skeleton and largely the same claims (memory, shared computer, routines, approvals). That gives Google little reason to treat them as distinct or to rank any of them.
6. **Query ambiguity.** "ai support triage" is more than half clinical (ED triage). The page's own H1, "support ticket triage", is the better target.

## 7. Recommendations (severity, evidence)

1. **CRITICAL: Rebuild /manus-alternatives as a real comparison page, or stop targeting the query.** Evidence: 9/9 results are lists or directories, and the page says it does "not publish side-by-side scores". Use a dated table of named tools (ChatGPT Agent, Flowith, Genspark, Lindy, Krafty, ...) with columns for signup access, free tier, pricing model, approvals before writes, scheduled runs and own cloud computer. Every fact should be cited from the vendor's public page with a check date, and the page should say "best for" honestly, including where others win. Add ItemList schema. This reverses a deliberate content policy ("What we will not claim"), so it is the owner's call; the copy would live in `lib/marketing/content.ts`.
2. **HIGH: Turn the three topic pages into guides of 1,500+ words, with Krafty as the worked example.** Evidence: ~60-100% of these SERPs are guides and definitions. Add definition, types or levels of autonomy, examples by department, risks and governance, how to choose, and price ranges. Add Article schema with a named author (founder byline) and datePublished. Give each page a distinct angle so they stop cannibalizing each other (business = SMB playbook; employees = the "real or marketing" debate plus roles; autonomous = levels of autonomy and safety).
3. **HIGH: Add a guide layer to the use-case pages.** Evidence: the outbound SERP is 78% guides and roundups; the triage SERP is guides plus an "8 best tools" listicle. Add sections for "What an AI outbound agent should and shouldn't own" and the tool categories (11x/AiSDR/Apollo/Clay vs general agents), a real sample output (redacted drafted email, review list), and an FAQ. For triage, retarget to "AI support ticket triage", and cover categorize, sentiment, priority and routing, plus human approval (appmaster's angle, where Krafty is strong).
4. **HIGH: Add real media.** Evidence: none of the 7 pages has an `<img>` or `<video>`. Add screenshots or a short video of the approval prompt, a routine schedule and a Bot's output, using only real product state (DESIGN/PRODUCT rules).
5. **HIGH: Build off-site authority.** Evidence: AlternativeTo and softwares.com hold 3 of the 9 "manus alternatives" spots. List Krafty on AlternativeTo (as a Manus alternative), Product Hunt and G2, and pitch inclusion in existing "best AI employees" and "Manus alternatives" roundups.
6. **MEDIUM: Show pricing and safety on every page.** Evidence: the cost and risk persona scores Trust 8/25, and $20 Pro is shown only on the homepage. Add a pricing strip from `planLimits` and a link to a safety or "what is enforced" page. Add SoftwareApplication with Offer schema to topic and use-case pages.
7. **MEDIUM: Schema.** Evidence: the use-case pages have only WebPage and BreadcrumbList. Add FAQPage (for AI answer engines, since Google no longer shows the rich result), Article with author on guides, and ItemList on the comparison page.

Cross-skill follow-ups: `/seo content` (E-E-A-T and author signals), `/seo schema` (SoftwareApplication, Article, ItemList), `/seo page` (thin content on all six). No local intent was detected, so `/seo local` is not needed.

## 8. Limitations

- WebSearch returns organic titles and URLs plus a synthesized summary. It does not show People Also Ask boxes, ads, AI Overview citations, featured snippets or exact positions, so SERP-feature analysis and user stories rest on result types and summaries. The results are US-only and not personalized.
- Competitor word counts, schema and media were not measured; competitor pages were classified from title and URL.
- Main-text word counts use trafilatura extraction and may undercount UI text.
- Visuals drawn with CSS or SVG were not counted as media; only `<img>` and `<video>` tags were.
- Backlinks, domain authority, Search Console data and actual rankings were not available. One search was run per query, with no variants.
- The other use-case pages and /how-it-works were not analyzed in depth.

## 9. Structured findings (Search Experience category, JSON-compatible)

```json
{"category":"Search Experience","sxo_gap_scores":{"/ai-agents-for-business":44,"/ai-employees":43,"/autonomous-ai-agent":45,"/manus-alternatives":37,"/use-cases/sales-outbound":42,"/use-cases/support-triage":41},
"mismatches":[{"query":"manus alternatives","serp":"Comparison","page":"Single product","severity":"CRITICAL"},{"query":"ai agents for business","serp":"Blog/guide","page":"Hybrid product","severity":"HIGH"},{"query":"ai employees","serp":"Blog/guide","page":"Hybrid product","severity":"HIGH"},{"query":"autonomous ai agent","serp":"Definitional guide","page":"Thin definitional hybrid","severity":"MEDIUM"},{"query":"ai sales outbound agent","serp":"Blog/guide + roundup","page":"Use-case product","severity":"HIGH"},{"query":"ai support triage","serp":"Split clinical/support guides","page":"Use-case product","severity":"HIGH"}],
"personas":{"developer":52,"smb_owner":55,"solo_founder":61}}
```

Generate a PDF report? Use `/seo google report`.
