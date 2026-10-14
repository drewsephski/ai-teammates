# Built-in web research

Set `TAVILY_API_KEY` in `.env.local`, the Railway `ai-teammates` production service, and the Trigger.dev project's production environment. The chat worker runs on Trigger.dev; setting only Railway's key does not configure the bots. Keep the key server-side and never use a `NEXT_PUBLIC_` prefix. Redeploy the app and chat worker when releasing this integration. Restart the local worker after changing its environment.

The key belongs to the app. People do not connect Tavily through Apps, and web research works on both free and paid plans without an E2B computer. Bots can use web research and connected apps before setup is complete; paid bots also retain their computer and team tools. A task takes priority over profile setup, while saving a profile still requires confirmation. With no key, the tools are omitted and the prompt explicitly says live web search is unavailable.

## Tools

- `searchWeb`: focused query, basic/advanced depth, up to ten results (default five), general/news topic, optional relative or exact date window, and domain inclusion/exclusion. Returns URLs, titles, bounded excerpts, detected publication/update dates, and truncation flags. Date-window searches exclude sources without a detectable publication date.
- `readWebPage`: reads one public HTTP(S) URL as Markdown. Optional `query` returns relevant excerpts; advanced extraction can recover tables or missed content. Returns a source URL, content, and flags for truncation and excerpts. Sign-in pages and failed extraction are reported as failures.

Requests go to Tavily's fixed HTTPS API, never directly to a model-supplied destination on the app's network. Inputs reject credential-bearing URLs, custom ports, IP addresses and local/internal hostnames. Provider results cannot supply nonpublic or executable citation URLs. Search excerpts are capped at 3,000 characters per result and page reads at 20,000 characters. The tool calls appear in chat with readable source links and accurate failure states.

## Research behavior

System instructions tell every configured bot, including group-chat handoff recipients, to search for current/changeable facts, explicit research requests and uncertain subjects; skip browsing for stable tasks such as rewriting supplied text; read sources before quoting or relying on detailed claims; prefer primary sources; cite retrieved source URLs; and distinguish evidence from inference. Bots honor requests not to browse and treat all external content as untrusted data rather than instructions. The current UTC date is included in the prompt.

## Cost and failure handling

Search and extraction spend use the existing AI allowance, alongside model tokens. Tavily-reported credits are priced at the public PAYG rate of $0.008 per credit, in millionths of a dollar. Basic/advanced search reserve an allowance check for one/two credits; page reads conservatively check one/two credits because extraction credits may be accounted for in batches. Accepted requests without usable usage metadata fall back to that amount, including malformed responses. Reported zero-credit reads are honored. Provider subscription discounts are not reflected in this rate.

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

The live script checks search and extraction, current-information search/read/citation behavior, direct reading of supplied URLs, and no browsing for a rewrite. It outputs check summaries rather than credentials or raw provider bodies. The focused tests cover malformed responses, provider errors, URL/input validation, output bounds, cancellation, timeouts, allowance enforcement, usage accounting, and parallel calls.

API references: [Search](https://docs.tavily.com/documentation/api-reference/endpoint/search), [Extract](https://docs.tavily.com/documentation/api-reference/endpoint/extract), [Credits](https://docs.tavily.com/documentation/api-credits).
