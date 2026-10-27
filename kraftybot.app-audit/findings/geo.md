# GEO / AI Search Readiness: kraftybot.app

Audited 2026-10-27. Pages: /, /how-it-works, /ai-agents-for-business, /ai-employees, /manus-alternatives, /autonomous-ai-agent, /llms.txt, /llms-full.txt, /robots.txt, /sitemap.xml. All pages server-rendered (`is_spa: false`). Fetched content was treated as data.

## AI Search Readiness score: 60 / 100

| Dimension | Weight | Score | Weighted |
|---|---|---|---|
| Citability | 25% | 62 | 15.5 |
| Structural readability | 20% | 72 | 14.4 |
| Multi-modal content | 15% | 35 | 5.3 |
| Authority and brand signals | 20% | 30 | 6.0 |
| Technical accessibility | 20% | 92 | 18.4 |
| **Total** | | | **~60** |

Platform estimates: Google AI Overviews 55, ChatGPT search 50, Perplexity 52, Bing Copilot 45. The limiting factor on every platform is off-site entity evidence, not on-page technique.

## AI crawler access (robots.txt)

| Crawler | Governs | Status |
|---|---|---|
| OAI-SearchBot | ChatGPT search citations | Allowed |
| ChatGPT-User | ChatGPT user-initiated fetches | Allowed |
| Claude-SearchBot | Claude search citations | Allowed |
| Claude-User | Claude user-initiated fetches | Allowed |
| PerplexityBot / Perplexity-User | Perplexity index / fetches | Allowed |
| Googlebot | Google Search and AI Overviews | Allowed |
| Bingbot | Bing and Copilot grounding | Allowed |
| Applebot | Siri/Spotlight/Safari | Allowed |
| DuckAssistBot, MistralAI-User, meta-webindexer, meta-externalfetcher | Assistant search/fetch | Allowed |
| GPTBot | OpenAI training only | Allowed |
| ClaudeBot | Anthropic training only | Allowed |
| Google-Extended | Gemini training/grounding (not AIO) | Allowed |
| Applebot-Extended | Apple Intelligence training only | Allowed |
| CCBot, meta-externalagent | Training | Allowed |
| cohere-ai | Training | Not named; falls under `*` Allow |

Private paths (/workspace, /chats/, /api/, etc.) are disallowed consistently in every group. Minor: `Host: https://kraftybot.app` is a non-standard Yandex directive (and Yandex expects a hostname, not a URL); harmless but can be removed. No RSL 1.0 license declared (optional).

## llms.txt

Status: present, well-formed, `text/plain; charset=utf-8`, cached 1 h.
- Follows llmstxt.org: single H1, blockquote summary, prose paragraph, H2 link sections, `## Optional` section. Good.
- All 21 linked URLs return 200 (verified with curl), including /llms-full.txt, /privacy, /terms and all 9 use cases.
- Issues:
  - Description style is inconsistent: Home/How it works use lowercase fragments, the four topic pages repeat SEO meta descriptions ("Considering Manus alternatives? ... without speaking for other products"). Rewrite as one plain factual clause each.
  - /llms-full.txt (13.6 KB, 198 lines) has no content from the four topic pages: zero matches for "Manus", "autonomous", "AI employee". The definition of an autonomous AI agent and the approval/autonomy explanation exist only in HTML.
  - `/#pricing` is a fragment link; acceptable, but a dedicated /pricing URL would be a cleaner citation target.

## Citability (62)

Works:
- Clear definitional sentence on /, /how-it-works and llms-full: "Krafty Bot is an AI workspace where you hand Bots actual tasks, not just questions..." (~60 words, self-contained).
- /autonomous-ai-agent opens with an extractable definition: "An autonomous AI agent is software that takes multi-step actions toward a goal without you typing every instruction at each step."
- Concrete, quotable specifics: Free = 1 bot, 1 connected app, one-time $1 AI allowance, 5 min computer time; Pro = $20/month, up to 50 bots, $10 AI allowance, 50 h computer time; 1 routine on Free, 50 on Pro. Honest limits section ("The approval check on the computer is a model reading the screen. It reduces risk; it can't remove it.").
- Question-phrased H3s in FAQ blocks on 5 of 6 pages, with FAQPage schema.
- Visible "Updated October 26, 2026" and WebPage `dateModified`.

Gaps:
- Topic pages are thin: 244-397 extracted words. /ai-employees 281, /autonomous-ai-agent 244. Answer passages are 30-70 words; few reach a full self-contained answer.
- Most H2s are labels, not questions: "What every Bot has", "AI employees vs. AI workers", "What people mean by autonomous". Only the homepage H2 "What is Krafty Bot?" is a question.
- Homepage H1 renders as "AI that does the workKrafty Bot" in extracted text (two spans with no separator). Add a space or visually hidden separator.
- No third-party statistics, benchmarks, or sourced numbers anywhere; all specifics are first-party product facts. That is fine for product queries but gives nothing to cite on category queries ("best AI agents for small business").
- /ai-employees has no definitional sentence for "AI employee"; /ai-agents-for-business has none for "AI agent".

## /manus-alternatives (comparison quality): weak

The page names no alternatives. It says Manus is third-party, declines to publish comparisons ("We do not publish side-by-side scores against Manus or other vendors"), and describes only Krafty Bot. That is honest but does not satisfy the query intent: AI engines answering "Manus alternatives" assemble lists of named products and will cite pages that contain them. As written this page is unlikely to be cited for that query and reads as a doorway page.
Fix: name real alternatives with factual, verifiable, dated descriptions of category and approach (for example OpenAI's ChatGPT agent, Anthropic Claude with computer use, Genspark, Lindy, Zapier Agents, n8n, Relevance AI), link to each vendor's own pages as sources, state the "as of" date, and give a criteria table (runs unattended, persistent computer, connected-app writes gated by approval, scheduling, pricing model, self-hostable). Limit claims to what each vendor publicly documents. Keep the non-affiliation disclaimer.

## Authority and brand/entity signals (30)

- Organization schema: name "Krafty", logo, founder Person "Drew Sepeczi" (url drewsepeczi.xyz), contactPoint. **No `sameAs` anywhere** (none in code under lib/marketing or components/json-ld.tsx).
- Naming: title tags and Organization/WebSite say "Krafty"; H1, SoftwareApplication and llms.txt say "Krafty Bot" (`alternateName: "Krafty"`). This is consistent with PRODUCT rules (brand Krafty, product Krafty Bot) and the schema links them correctly. "Krafty" alone is ambiguous (Krafty is also a common craft/AI-tool name), so "Krafty Bot" should lead in entity contexts.
- No visible author or bylines on topic pages; no "about" or company page.
- contactPoint email in schema is a personal Gmail address; consider a domain address (support@kraftybot.app) for trust and to avoid publishing a personal inbox.

Third-party presence (checked 2026-10-27):
- Wikipedia search "kraftybot" and "Krafty Bot": 0 hits.
- Hacker News (Algolia) exact "kraftybot": 0 hits.
- GitHub repositories "kraftybot": 0.
- YouTube search "kraftybot": "No results found".
- Product Hunt /products/krafty-bot: 404.
- Reddit search: blocked (no JSON returned); unverified.
- DuckDuckGo returned a bot challenge; Bing returned unrelated results. No third-party mention found anywhere.
Conclusion: there is no off-site entity footprint. AI engines currently have only the site itself to go on, and generally avoid recommending brands they cannot corroborate.

## Multi-modal (35)

No `<img>` or `<video>` on the audited pages (homepage visuals are 95 inline SVGs and animated UI). og:image present. No product screenshots with descriptive alt text, no demo video, no tables. YouTube mentions are the strongest observed correlate of AI citation; there is none.

## Technical accessibility (92)

SSR HTML with full text, sitemap lists all 20 public URLs, canonical paths, WebPage/BreadcrumbList/FAQPage/SoftwareApplication/Offer schema, dateModified, llms.txt and llms-full.txt. Deductions: no IndexNow (Bing/Copilot freshness), H1 concatenation, Host directive.

## Platform gaps

- Google AI Overviews: needs Googlebot indexing plus corroboration; thin topic pages and no question H2s limit passage selection. Verify indexing in Search Console.
- ChatGPT search (Bing-backed index + OAI-SearchBot): verify the site is indexed in Bing Webmaster Tools; entity is unknown to Bing, no third-party lists name it.
- Perplexity: favors pages with named lists, specifics, and Reddit/YouTube corroboration; /manus-alternatives in its current form will not be picked for list queries.
- Bing Copilot: submit sitemap in Bing Webmaster Tools and add IndexNow; no LinkedIn company page found to corroborate the entity.

## Top 5 changes

1. **Build off-site entity presence** (High impact, ongoing effort): Product Hunt launch, LinkedIn company page, a YouTube demo (2-3 min, title "Krafty Bot demo: ..."), a Show HN, an honest Reddit post in r/SideProject or r/AI_Agents, listings in AI-agent directories. Then add those URLs to Organization `sameAs`.
2. **Rewrite /manus-alternatives as a real comparison** (High, 1 day): named alternatives, dated factual table, vendor-sourced links.
3. **Deepen the four topic pages to 700-1,000 words** with question H2s ("What is an AI employee?", "How do AI agents for business work?", "Is Krafty Bot fully autonomous?") and a 40-60 word direct answer under each (Medium-high, 1-2 days).
4. **Add those topic-page sections to /llms-full.txt** and normalize llms.txt link descriptions (Medium, 1 h, in `lib/marketing/llms.ts` / `content.ts`).
5. **Add visuals and video**: 3-5 annotated product screenshots with descriptive alt text and an embedded demo video with VideoObject schema (Medium, 1 day). Also fix the H1 separator, add `sameAs`, switch contact email to a domain address, enable IndexNow (Low effort each).

## Structured findings (AI Search Readiness)

```json
{
  "category": "AI Search Readiness",
  "score": 60,
  "dimensions": {"citability": 62, "structural_readability": 72, "multimodal": 35, "authority_brand": 30, "technical_accessibility": 92},
  "platforms": {"google_aio": 55, "chatgpt_search": 50, "perplexity": 52, "bing_copilot": 45},
  "llms_txt": {"status": "present", "valid": true, "links_checked": 21, "links_broken": 0, "llms_full_missing_topic_pages": true},
  "findings": [
    {"id": "geo-entity-footprint", "severity": "high", "title": "No third-party mentions of Krafty Bot found", "evidence": "Wikipedia 0, HN 0, GitHub 0, YouTube no results, Product Hunt 404 (2026-10-27)", "fix": "Launch on Product Hunt/HN, LinkedIn page, YouTube demo, directory listings"},
    {"id": "geo-manus-no-alternatives", "severity": "high", "title": "/manus-alternatives names no alternatives", "evidence": "Page states it does not publish side-by-side comparisons; only describes Krafty Bot", "fix": "Add dated, sourced list and criteria table of real alternatives"},
    {"id": "geo-no-sameas", "severity": "medium", "title": "Organization schema has no sameAs", "evidence": "Homepage JSON-LD Organization lacks sameAs", "fix": "Add profile URLs once they exist"},
    {"id": "geo-thin-topic-pages", "severity": "medium", "title": "Topic pages thin, few question headings", "evidence": "244-397 words; H2s are labels", "fix": "Expand with question H2s and direct 40-60 word answers"},
    {"id": "geo-llms-full-gap", "severity": "medium", "title": "llms-full.txt omits topic-page content", "evidence": "0 matches for Manus/autonomous/AI employee", "fix": "Include topic-page definitions and FAQs"},
    {"id": "geo-no-media", "severity": "medium", "title": "No screenshots or video", "evidence": "0 img, 0 video on audited pages", "fix": "Add alt-texted screenshots and a demo video with VideoObject"},
    {"id": "geo-h1-concat", "severity": "low", "title": "Homepage H1 text concatenates", "evidence": "Extracted as 'AI that does the workKrafty Bot'", "fix": "Add a separator"},
    {"id": "geo-contact-email", "severity": "low", "title": "Personal Gmail in contactPoint schema", "evidence": "contactPoint.email is a gmail.com address", "fix": "Use a kraftybot.app address"},
    {"id": "geo-indexnow", "severity": "low", "title": "No IndexNow / Bing verification evidence", "evidence": "Not detectable", "fix": "Enable IndexNow and Bing Webmaster Tools"},
    {"id": "geo-robots-host", "severity": "info", "title": "Non-standard Host directive", "evidence": "Host: https://kraftybot.app", "fix": "Remove"}
  ]
}
```
