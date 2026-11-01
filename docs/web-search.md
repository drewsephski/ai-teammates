# Built-in web research

Set `TAVILY_API_KEY` in `.env.local`, the Railway `ai-teammates` production service, and the Trigger.dev project's production environment. The chat worker runs on Trigger.dev; setting only Railway's key does not configure the bots. Keep the key server-side and never use a `NEXT_PUBLIC_` prefix. Redeploy the app and chat worker when releasing this integration. Restart the local worker after changing its environment.

The key belongs to the app. People do not connect Tavily through Apps, and web research works on both free and paid plans without an E2B computer. Bots can use web research and connected apps before setup is complete; paid bots also retain their computer and team tools. A task takes priority over profile setup, while saving a profile still requires confirmation. With no key, the tools are omitted and the prompt explicitly says live web search is unavailable.

## Firecrawl page reads

With `FIRECRAWL_API_KEY` set (in `.env.local` and the Trigger.dev production environment; only the chat worker reads it), `readWebPage` reads through Firecrawl's `/v2/scrape` first (`lib/firecrawl.ts`). Firecrawl renders JavaScript and gets past bot walls that Tavily's extractor fails on: Tavily can't fetch BizBuySell listing pages at either depth, while Firecrawl returns the listings with their figures. The app pays for these reads with its own Firecrawl credits, so they are free on every plan and are not recorded in the person's usage. Each turn gets 30 Firecrawl reads (`FIRECRAWL_READS_PER_TURN`). A failed or over-cap Firecrawl read falls back to Tavily, which is billed as before. Firecrawl ignores `query` and returns the page's main content, bounded at 20,000 characters, with `excerptsOnly: false`. The tool name and output shape are unchanged, so the web and mobile clients render it as before. Without the key, reads go to Tavily only.

## Context.dev review and social data

With `CONTEXT_DEV_API_KEY` set (in `.env.local` and the Trigger.dev production environment; only the chat worker reads it), bots get two more tools on every plan (`lib/social-tools.ts`, client in `lib/context-dev.ts`), and `readWebPage` gains a reader:

- `readReviews` reads the newest public reviews from an App Store app (up to 500), a Google Play app (200), a G2 product (25), a Yelp business (20) or a Google Maps place (up to 1,000, with `sort`) through context.dev's prebuilt parsers. The parser is picked from the URL; any other URL is refused before a request. `minRating`/`maxRating` filter after fetching, and `limit` (default 60, max 200) caps what is returned. The result reports `fetched`, `matching`, `returned` and `truncated`, plus the parser's other fields as `about`.
- `readSocialMedia` reads public Instagram profiles, posts, hashtags and locations, and TikTok profiles, videos, comments (`view: "comments"`), a profile's latest videos (`view: "posts"`), hashtag and search feeds and user searches. Follower and following lists are left out on purpose, and short links are refused.
- `readWebPage` tries context.dev's Markdown scrape after Firecrawl fails and before Tavily, because it renders JavaScript and costs less than Tavily per read.

Parser results may be an hour old at most (`maxAgeMs`), page reads a day. Records are compacted before the model sees them: media, avatar and id fields are dropped, text is capped at 1,500 characters a field, nested lists at 12 items, review results at 40,000 characters and social results at 30,000. Only public http(s) links survive.

Context.dev is billed to the person's AI allowance at its Developer-plan overage rate, $0.003 a credit (`CONTEXT_DEV_CREDIT_COST`). A request first checks the allowance for 1 credit (page read) or 5 (parser; context.dev prices parsers "from 1 credit"), then records what `key_metadata.credits_consumed` or the `X-Credits-Used` header reports, under `ai:${runId}:${turn}:context:${toolCallId}`, and adds it to the turn's spend. Without a reported figure, a usable result is charged its reservation and a result where every output failed is charged nothing, as context.dev doesn't bill those. Non-2xx responses are never charged. Without the key, the tools are omitted, `readWebPage` skips context.dev, and the prompt says review and social data is not configured.

The `competitor-reviews` preset (Rival) is built on these tools.

`scripts/verify-context-dev.ts` is an opt-in live check (`pnpm exec tsx --env-file=.env.local scripts/verify-context-dev.ts`): one real call per review source, Instagram, TikTok and a Reddit page read, about 10 credits, no model calls. On 2026-10-31 every source worked except Yelp, whose parser returned `INTERNAL_ERROR` on every business tried (uncharged); the tool reports that as a temporary provider error.

## Tools

- `searchWeb`: focused query, basic/advanced depth, up to ten results (default five), general/news topic, optional relative or exact date window, and domain inclusion/exclusion. Returns URLs, titles, bounded excerpts, detected publication/update dates, and truncation flags. Date-window searches exclude sources without a detectable publication date.
- `readWebPage`: reads one public HTTP(S) URL as Markdown. Optional `query` returns relevant excerpts; advanced extraction can recover tables or missed content. Returns a source URL, content, and flags for truncation and excerpts. Sign-in pages and failed extraction are reported as failures.

Requests go to Tavily's fixed HTTPS API, never directly to a model-supplied destination on the app's network. Inputs reject credential-bearing URLs, custom ports, IP addresses and local/internal hostnames. Provider results cannot supply nonpublic or executable citation URLs. Search excerpts are capped at 3,000 characters per result and page reads at 20,000 characters. The tool calls appear in chat with readable source links and accurate failure states.

## Research behavior

System instructions tell every bot, including unfinished setup chats and group-chat handoff recipients, to search for current/changeable facts, explicit research requests and uncertain subjects; skip browsing for stable tasks such as rewriting supplied text; read sources before quoting or relying on detailed claims; prefer primary sources; cite retrieved source URLs; and distinguish evidence from inference. Bots honor requests not to browse and treat all external content as untrusted data rather than instructions. The current UTC date is included in the prompt.

## Cost and failure handling

Search and Tavily extraction spend use the existing AI allowance, alongside model tokens; Firecrawl reads are app-funded. Tavily-reported credits are priced at the public PAYG rate of $0.008 per credit, in millionths of a dollar. Basic/advanced search reserve an allowance check for one/two credits; page reads conservatively check one/two credits because extraction credits may be accounted for in batches. Accepted requests without usable usage metadata fall back to that amount, including malformed responses. Reported zero-credit reads are honored. Provider subscription discounts are not reflected in this rate.

Calls within a turn serialize budget checks and usage writes. Each accepted request is recorded immediately with an idempotency key containing the run, turn and tool-call ID; it also contributes to the agent's per-turn stop condition. Free-account conversations retain the existing account-level serialization. Paid concurrent conversations retain the existing model-metering policy; the ledger is not a global prepaid reservation system.

Requests propagate Stop/cancellation and time out after 35 seconds. Cancellation is not presented as successful research. Provider auth, quota, rate-limit, network, timeout, malformed-response and extraction failures return sanitized messages. No raw provider error body or credential is returned. A network failure before a usable response cannot establish whether Tavily charged a request; such requests cannot be metered from provider-reported usage.

## Verification

```bash
pnpm exec tsx --test tests/web-tools.test.ts
pnpm typecheck
pnpm lint
# Real Tavily calls and real chat-model behavior; consumes provider usage:
pnpm exec tsx --env-file=.env.local scripts/verify-web-agent.ts
```

The live script checks search and extraction, research during unfinished setup without saving an unapproved profile, current-information search/read/citation behavior, direct reading of supplied URLs, and no browsing for a rewrite. It outputs check summaries rather than credentials or raw provider bodies. The focused tests cover malformed responses, provider errors, URL/input validation, output bounds, cancellation, timeouts, allowance enforcement, usage accounting, and parallel calls.

API references: [Search](https://docs.tavily.com/documentation/api-reference/endpoint/search), [Extract](https://docs.tavily.com/documentation/api-reference/endpoint/extract), [Credits](https://docs.tavily.com/documentation/api-credits).
