# Default bot web-search API comparison

Research date: October 13, 2026.
Use case: General-purpose research and current-information lookup for AI Teammates bots.
Budget and expected volume: Not specified; favor a free trial and predictable usage billing.

## Recommendation

Start with **Tavily** for the default search and page-reading tools. Its search API exposes source content, optional full-page text, news search, date filters, and domain controls. This is a fit recommendation based on documentation, not a measured quality ranking.

**Context.dev** is the strongest budget candidate for a combined search/content service. **Exa** is a close alternative worth testing for research and discovery. **Firecrawl** is especially worth considering when website scraping and crawling become substantial workloads. No evaluated vendor warrants an outright avoid recommendation.

## Comparison

Scores are provisional engineering judgments, not benchmark results. Weighting: core fit 40%, pricing 25%, integration 20%, operational risk 15%. All can be called from the current TypeScript agent using HTTP; published support channels do not establish support quality or uptime.

| Vendor      | Pricing                                                                                                   | Core fit                                             | Integration          | Support / limits                                 | Overall |
| ----------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------- | ------------------------------------------------ | ------- |
| Tavily      | 1,000 free credits/month; PAYG $8/1,000 basic or $16/1,000 advanced searches                              | General research with source content and filters     | HTTP, TypeScript SDK | Public docs; support quality untested            | 8/10    |
| Context.dev | 1,000 free credits/month; $19/month for 7,500 credits                                                     | Search, highlights, page Markdown, crawling          | HTTP, TypeScript SDK | Developer: 10 concurrent requests, email support | 8/10    |
| Exa         | $10 free credits/month plus $10 onboarding; Instant $4, Fast/Auto $7 per 1,000 requests, up to 10 results | Multiple retrieval modes, source text and highlights | HTTP, TypeScript SDK | PAYG email support; Starter 10 search QPS        | 8/10    |
| Firecrawl   | 1,000 free credits/month; Hobby $16/month billed annually for 5,000 credits                               | Search with optional scraping, website ingestion     | HTTP, SDK            | Hobby 5 concurrent requests, basic support       | 7/10    |
| Brave       | $5/1,000 requests with $5 monthly free credits                                                            | Broad search and LLM context                         | HTTP                 | Search capacity 50 QPS; support quality untested | 7/10    |

Pricing is not directly comparable without specifying content retrieval. Model tokens are additional.

## Vendor details and sources

### Tavily

Basic search costs one credit; advanced costs two. Monthly plans start at $30 for 4,000 credits, and larger plans lower the unit cost. Search can include cleaned page content; Extract is available for known URLs. Explicitly select depth to keep cost predictable. Advantages: research-oriented results, filters, and one provider for search/read. Limitations: advanced doubles search cost, and coverage needs testing on actual bot questions.

Sources: [Pricing](https://docs.tavily.com/documentation/api-credits), [Search reference](https://docs.tavily.com/documentation/api-reference/endpoint/search).

### Context.dev

Search costs one credit per ten results; highlights and Markdown each add one credit per ten results. A ten-result search with Markdown therefore costs two credits. Developer overage is $2.20/1,000 credits. Annual billing saves two months. Advantages: bundled web tooling, optional content, and low advertised credit costs. Limitations: subscriptions and concurrency limits require planning; search relevance is untested here. Check individual result status before using content.

Sources: [Search](https://www.context.dev/search-api), [Pricing](https://www.context.dev/pricing).

### Exa

Search accepts content/highlight options in the same request. Deep search costs $12/1,000 requests and Deep-Reasoning $15. Extra results above ten and AI page summaries add fees. Advantages: selectable search modes, excerpts, and research workflows. Limitations: modes change latency/cost and relevance requires a representative evaluation. PAYG avoids a subscription commitment.

Sources: [Pricing](https://exa.ai/pricing), [Search reference](https://exa.ai/docs/reference/search).

### Firecrawl

Search costs two credits per ten results, rounded up. Scraping adds one credit per webpage; PDF parsing and structured extraction have additional costs. A search that scrapes five ordinary webpages costs seven credits. Advantages: search with optional page ingestion, Markdown extraction, and crawling workflows. Limitations: automatically scraping every hit increases cost; displayed paid prices are annual commitments.

Sources: [Search and credit rules](https://docs.firecrawl.dev/features/search), [Pricing](https://www.firecrawl.dev/pricing).

### Brave

Provides web/news/image search and a source-context endpoint for LLMs. Advantages: independent index, broad search surfaces, and straightforward request pricing. Limitations: full-page ingestion may need a separate reader; index coverage still needs evaluation. The separate Answers product has token charges and should not be confused with Search.

Source: [API features and pricing](https://brave.com/search/api/).

## User sentiment

Public anecdotes are mixed and cannot establish a winner. A [September comparison thread](https://www.reddit.com/r/SearchAPIs/comments/1wn9zke/has_anyone_compared_exa_tavily_and_firecrawl_for/) describes Tavily as easy to use in AI workflows and Firecrawl as useful for page extraction. A [July thread](https://www.reddit.com/r/LocalLLaMA/comments/1v3uyop/what_do_people_use_for_search/) reports freshness and regional-news problems across several providers. Independent Context.dev search feedback was insufficient to infer consensus. Treat vendor testimonials as marketing evidence.

## Proposed integration

Current repository inspection found connected-app discovery and sandbox tools, with no dedicated web-search tool in the chat agent. Add server-owned `searchWeb` and `readWebPage` tools available independently of a bot's cloud computer or the user's connected apps. Start searches with five results and bounded source excerpts; fetch fuller pages when needed. Preserve URLs for citations, propagate cancellation, surface provider failures, and meter external calls against user allowances.

Keep provider details inside a small module so evaluation can change the vendor without changing the bot-facing tools. The chat worker runs on Trigger.dev, so its production environment needs the provider credential. No provider account, credential, dependency, or runtime configuration was changed during this comparison.

Before making a quality claim, compare approximately 30 real bot questions across the shortlisted services, including current news, official documentation, comparisons, obscure facts, and non-US queries. Measure useful sources, freshness, latency, total retrieval/token cost, and extraction failures.
