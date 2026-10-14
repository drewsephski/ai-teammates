# ChatGPT sign-in and subscription usage

Krafty supports an optional ChatGPT identity and a separate permission to fund model replies with the user's ChatGPT plan. The sign-in and sign-up pages offer **Continue with ChatGPT** when configured. Existing users connect from **Usage → ChatGPT plan**; the workspace links to the same controls.

## Hosted access and activation

OpenAI currently requires approval for paid or remotely hosted apps. Apply through the [Sign in with ChatGPT interest form](https://openai.com/form/sign-in-with-chatgpt-interest/) for **Sign in and ChatGPT plan use for AI requests**. The public dynamic-agent registration flow for open-source/local apps is not used by this hosted service.

After approval, obtain the provisioned client and confirm its identity scopes, token-endpoint authentication method, and ChatGPT plan permission with OpenAI. Register these exact callback URLs for the environments you intend to use:

- Production: `https://kraftybot.app/api/chatgpt/callback`
- Local development, if approved for the client: `http://localhost:3000/api/chatgpt/callback`

Configure the following server-side variables in ignored `.env.local`, Railway's `ai-teammates` service / `production`, and the Trigger.dev project's `prod` environment:

| Variable | Value |
| --- | --- |
| `CHATGPT_CLIENT_ID` | The OpenAI-provisioned `oaiapp_…` client ID. Leave empty until provisioned. |
| `CHATGPT_CLIENT_SECRET` | Client secret for a confidential client using `client_secret_basic`; leave empty only for a provisioned public client. |
| `CHATGPT_REDIRECT_URI` | The exact registered callback for this deployment. |
| `CHATGPT_TOKEN_ENCRYPTION_KEY` | A stable, cryptographically random 32-byte key encoded as 64 hexadecimal characters. Share it between the web app and workers that use the same database. |
| `CHATGPT_PLAN_USAGE_ENABLED` | `true` only after OpenAI has approved and enabled plan usage for this client; otherwise `false`. |

The local and production callback may differ, but the deployed web app must use its own canonical origin. An invalid or incomplete configuration disables the sign-in option. Identity-only sign-in can be enabled before subscription usage. No placeholder client, existing Codex client ID, ChatGPT cookies, or private ChatGPT endpoints are accepted. Never put credentials in `NEXT_PUBLIC_` variables. Rotating the encryption key requires reconnecting affected accounts; there is no credential backfill.

Apply the schema using `npm run db:push`. Deploy the web app and Trigger.dev worker together when releasing the feature. Configuration has been prepared with plan usage disabled; deploying code does not establish OpenAI approval.

## Authentication and credentials

Authorization uses OIDC discovery, fresh PKCE/state/nonce, an HttpOnly browser binding, and a ten-minute database transaction that is consumed atomically. State and browser bindings are hashed; the verifier and stored access/refresh tokens use AES-256-GCM with purpose/user-specific authenticated data. Verification checks JWT signature, issuer, audience, authorized party, expiry, issued-at time, and nonce. The callback enforces the authorization response's issuer when discovery advertises support.

Identity is linked by verified issuer/client/subject, never email alone. Existing users authenticate to Krafty before linking. A new verified identity can create a Clerk user; an email matching an existing account requires signing into that account first. Clerk creates a sixty-second, one-time sign-in ticket, which is transferred through an encrypted HttpOnly cookie and a same-origin POST rather than a URL. The browser receives only the Clerk completion ticket, never OpenAI credentials. Clerk's existing UI handles additional verification when required.

Refreshes are serialized with a direct-Postgres advisory lock shared by Railway and Trigger.dev. Tokens are rechecked for every inference request, including tool steps. Disconnecting clears local credentials and attempts remote refresh-token revocation, while retaining the identity mapping for sign-in. If remote revocation cannot be confirmed, the dashboard directs the user to disconnect Krafty in ChatGPT settings. OAuth routes and captured locals are redacted from Sentry events.

## Models and billing

- The selected funding provider is stored server-side. The browser cannot exempt a request from billing by changing chat metadata.
- ChatGPT selection routes the entire turn directly to OpenAI's public Responses API with the user's OAuth credential. It never routes subscription requests through the Neon gateway.
- Models come from the account-specific catalog. Users may choose a listed model; Automatic uses the first visible model in OpenAI's ordering.
- Each request sets `store: false`, `stream: true`, sends its conversation history, uses developer instructions, and groups application tools in the `krafty` namespace. Unsupported preview parameters are removed at the transport boundary.
- A request must reach `response.completed`. Usage-limit errors after HTTP 200, incomplete responses, and interrupted streams are failures.
- Subscription-backed **model** calls do not invoke Krafty's model pricing or add model charges to the AI ledger. They can run with zero remaining Krafty AI credit, including bot setup and delegated work within the user's existing plan entitlements.
- Tavily web searches still use Krafty's AI allowance. Cloud-computer time, teammate counts, connected-app limits, and other plan features retain their existing enforcement.
- ChatGPT's own subscription and per-app limits apply. There is no automatic fallback to app-funded models after a ChatGPT failure, expired grant, or revoked permission. Users explicitly choose Krafty AI in Usage. Ordinary sign-in preserves their saved funding choice.

Connecting grants no access to the user's ChatGPT conversation history or memories. The Usage page links to [ChatGPT usage settings](https://chatgpt.com/settings/usage).

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm exec tsx --test tests/chatgpt.test.ts tests/model-tool-replay.test.ts tests/billing-policy.test.ts
pnpm exec tsx --env-file=.env.local scripts/verify-chatgpt-auth.ts
pnpm build
```

The integration script uses real database operations, distributed locks, and signed JWT verification with fixture OpenAI/Clerk responses. It creates no provider accounts, makes no paid inference requests, and deletes its temporary rows. It checks callback replay, browser/session binding, JWT failures, concurrent refresh, encrypted persistence, account creation/linking, Clerk session handoff, model discovery, billing selection, and revocation. It is not proof of live OpenAI approval or a real user's subscription.

Once credentials are provisioned, verify a real new-user sign-up, existing-user account link, returning sign-in, selected-model reply with tool calls, token renewal, exhausted Krafty credit, declined consent, ChatGPT quota exhaustion, and disconnect. Compare the user's AI ledger before/after a model-only subscription turn; it must not change. Confirm mobile auth/dashboard layouts and any Clerk verification/session tasks on the deployed origin.

Official references: [quickstart](https://developers.openai.com/siwc/quickstart), [website sign-in](https://developers.openai.com/siwc/website), [subscription eligibility](https://developers.openai.com/siwc/token-sharing-open-source), [models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).
