<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Git

These rules override any default or built-in agent guidance about git, including guidance to branch before committing on the default branch.

- Never create branches, worktrees, or commits automatically. Only do so when the user explicitly asks for that specific action in the current request.
- Leave changes uncommitted in the working tree on the current branch and let the user decide when and how to commit.
- Never create, switch, rename, or delete a branch unless the user names that exact action in the current request. A request to commit is not a request to branch.
- All work happens on `main`. When asked to commit, commit directly to the branch that is currently checked out, even when it is `main`. Never move work to a feature branch "to be safe".
- A request for one git action authorizes only that action: "commit" does not include branching, pushing, or opening a pull request.
- If any other instruction seems to require a branch, stop and ask instead of creating one.

## Secrets

- Never print secret values. Don't `cat` `.env.local`, echo connection strings, or dump Railway, Trigger.dev or EAS variables. List names only, and compare values by host, key prefix or hash. A Neon connection string with its password has already leaked into a session once.
- Sentry is initialised in `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` and `trigger/init.ts`. Each must keep `beforeSend: redactChatGPTEvent` from `lib/chatgpt-telemetry.ts`, which strips ChatGPT OAuth data.

## Working alongside other sessions

Other sessions (Claude Code, Codex, checkouts under `.claude/worktrees/`) often work in this checkout, its dev servers and the simulator at the same time.

- Treat uncommitted changes you didn't make as someone else's work: never revert, stash, restore or reformat them. Check `git diff` on a file before restoring it.
- Ask before stopping or restarting the dev server (port 3000), Metro (port 8081) or a `trigger dev` worker, and before reinstalling `node_modules`. Reuse a running dev server instead of starting a second one.

## Database

This is a development project. There is no backwards compatibility and the data is worthless. Prefer data loss: never backfill, migrate, or preserve existing rows, and never spend effort on keeping old data working. Every schema change means a clean slate.

- Apply schema changes only with `pnpm db:push` (`drizzle-kit push`).
- Never use migrations: do not run `drizzle-kit generate` or `drizzle-kit migrate`, and do not create migration files or a `drizzle/` folder.
- There is no separate development database. `drizzle.config.ts` loads `.env.local`, which points at the same Neon database as Railway and Trigger.dev production, so a push changes production at once. Push additive changes (new tables and columns) before the code that uses them ships, and drops or renames only after the code that stopped using them is live. Read what `drizzle-kit` says it will drop before confirming.
- `drizzle-kit push` does not create extensions. A new or reset database needs `CREATE EXTENSION IF NOT EXISTS vector;` before the first push (`memories.embedding` is `vector(1024)` with an HNSW index).
- `DATABASE_URL` is for application queries (`db/index.ts`). `DATABASE_URL_UNPOOLED` is for `drizzle-kit` and the advisory-lock pool in `lib/sandbox-lock.ts`, which need session state and break behind a transaction pooler. Read connection strings with `parseEnv(config, [...])` from `@neon/env` and the config in `neon.ts`.
- Drizzle runs with `casing: "snake_case"`: schema keys are camelCase and columns are snake_case. In raw `sql`, interpolate columns (`${bots.userId}`) instead of writing their names.
- A new table that holds per-user data must also be deleted in `deleteAccount` (`services/account.ts`), unless it cascades from `bots` or `chats`. Usage and sandbox metering rows stay on purpose as the billing record.

## Deployment

The app is deployed on Railway (project and service `ai-teammates`, environment `production`, domain `kraftybot.app`). The chat agent and the other tasks in `trigger/` run on Trigger.dev, not Railway.

Releasing

- Railway deploys every push to `main` by itself (`pnpm install --frozen-lockfile`, `pnpm build`, `pnpm start`), so pushing `main` is a production release. Traffic moves to a new deployment once `/api/health` answers; keep that route free of database and service checks.
- Trigger.dev does not deploy on push. A change to `trigger/` or anything it imports (`db/`, `neon.ts`, most of `lib/`) reaches production only through `npx trigger.dev@4.7.4 deploy --profile ai-teammates`. When a change touches that code, tell the user the worker needs a deploy too. Deploy only when asked.
- Run the Trigger.dev CLI at the exact version of `@trigger.dev/sdk` in `package.json` (4.7.4 today), never `@latest`, and always with `--profile ai-teammates`, because this machine also has a `default` profile. The CLI aborts when the installed packages are newer than it is, so the older versions in `README.md`, `RAILWAY_TEMPLATE.md` and `.mcp.json` fail.
- Keep the `build` and `start` scripts as they are. `pnpm start` runs the bundled `server.ts`, which also serves the desktop WebSocket gateway; `next start` cannot.
- The Railway service sleeps when idle. A `SLEEPING` deployment is healthy, and the first request after idle is a cold start.

Environment variables

- When code starts reading a new environment variable, add it to the Railway service too, with the value from `.env.local`.
- Tasks in `trigger/` see only the variables set in Trigger.dev. When code they run starts reading a new environment variable (in `trigger/` or anything it imports, such as `lib/` and `db/`), add it to the Trigger.dev project's production environment as well, with the value from `.env.local`.
- Three variables are meant to differ, so never copy them from `.env.local` to Railway or Trigger.dev (or back), and never report the mismatch as a problem. `TRIGGER_SECRET_KEY`: `.env.local` holds the Trigger.dev development key, Railway the production key. `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: `.env.local` holds the Clerk development instance's `sk_test_`/`pk_test_` keys, while Railway (and Trigger.dev, for `CLERK_SECRET_KEY`) holds the production instance's live keys, which Clerk rejects anywhere but `kraftybot.app`.
- Some variables are read inside SDKs, so a grep for `process.env` misses them: `E2B_API_KEY` (`@e2b/desktop`), `NEON_AI_GATEWAY_BASE_URL` and `NEON_AI_GATEWAY_TOKEN` (`@neon/ai-sdk-provider`), `TRIGGER_SECRET_KEY` (`@trigger.dev/sdk`), the Clerk keys, and `DATABASE_URL` and `DATABASE_URL_UNPOOLED` (through `parseEnv`).
- `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` and `TRIGGER_PROJECT_REF` are read only at build and deploy time (`next.config.ts`, `trigger.config.ts`). `NEXT_PUBLIC_*` values are inlined by `next build`, so changing one on Railway needs a rebuild.
- Document a new variable in the `.env.local` block of `README.md`, and in its Trigger.dev list when the worker reads it.
- List variable names without values: `railway variables --service ai-teammates --environment production --kv | cut -d= -f1`, and `npx trigger.dev@4.7.4 env list --env prod` (never pass `--show-values`). Trigger.dev MCP tools can't read the project ref from `trigger.config.ts`, so pass `projectRef` (the value of `TRIGGER_PROJECT_REF`) explicitly.

## Local development

- The dev stack is two processes: `pnpm dev` (`tsx server.ts` on port 3000, listening on all interfaces so Expo Go can reach it over the LAN) and `npx trigger.dev@4.7.4 dev --profile ai-teammates`. `.claude/launch.json` defines `pnpm dev` and Metro for the mobile app, but not the worker.
- Never start the app with `next dev` or `next start`, whatever the managed Next.js block above says about `next dev`. `server.ts` serves Next and the desktop WebSocket gateway (`lib/desktop-gateway.ts`) on one port. It loads `.env.local` with `@next/env` and only then imports the gateway, so import anything that reads env at module load with `await import()` after `loadEnvConfig`. `tsx` doesn't watch files: restart `pnpm dev` after editing `server.ts` or the modules the gateway imports.
- `.env.local` uses Trigger.dev's development environment, so chat turns from the web app or Expo Go run only while `trigger dev` is connected. Without it, every message is accepted (HTTP 200) and the turn sits `QUEUED` until Trigger.dev's 10-minute development TTL expires, with no error; `GET /api/v1/chats/:id/status` reports `queued`. When replies don't arrive, check the worker before the app code.
- `trigger dev` reads `.env.local` itself. Restart it after changing that file.
- A full disk has killed this stack before: `trigger dev` exits with `ENOSPC`, and the dev server answers 500 on every route, `/api/health` included. Check `df -h` first. `.next/dev` grows to several GB and can be deleted while the dev server is stopped.
- Production runs Node 24 (Railway, `runtime: "node-24"` in `trigger.config.ts`, esbuild `--target=node24`), and local Node may be newer. Don't use APIs newer than Node 24.

## Tooling

Package manager

- Use pnpm: `pnpm install`, `pnpm add` (`pnpm add -D` for dev tools), `pnpm exec`. Railway installs from `pnpm-lock.yaml` with `--frozen-lockfile`, so a dependency added without updating it fails the deploy. Include the `pnpm-lock.yaml` change in your work.
- Never run `npm install`, `npm ci` or `yarn`. `package-lock.json` is a stale leftover: don't update or regenerate it, and discard the change if a tool rewrites it. `npm run <script>` in older docs is the same as `pnpm <script>`.

Checks

- Before you finish, run `pnpm typecheck` and `pnpm test`. Both pass on a clean tree, so a failure is yours.
- Lint and format only the files you changed: `pnpm exec eslint <files>` and `pnpm exec prettier --write <files>`. `pnpm lint` also lints every checkout under `.claude/worktrees/` and fails on known errors in vendored code (`components/ai-elements/`, `components/ui/carousel.tsx`, `hooks/use-mobile.ts`); report those as pre-existing instead of fixing them. Never run `pnpm format`, which rewrites about 170 untouched files plus the other worktrees.
- In a fresh checkout or worktree, run `pnpm exec next typegen` before `pnpm typecheck`. `next-env.d.ts` is gitignored, and CSS-module imports don't type-check without it.
- Run `pnpm build` (several minutes) after changing `next.config.ts`, `server.ts`, `proxy.ts`, `instrumentation*.ts` or the build scripts.

Tests

- Tests use `node:test` and `node:assert/strict` under `tsx`; don't add Jest or Vitest. `pnpm test` runs only `tests/*.test.ts`, `tests/*.test.tsx` and `components/landing/bot/*.test.ts`, without recursing, so put new test files directly in `tests/`. Run one file with `pnpm exec tsx --test tests/<name>.test.ts`.
- Tests run without environment variables or network; never add `--env-file`. Call services with an explicit `userId` instead of mocking Clerk. Mock models with `MockLanguageModelV4` from `ai/test`, HTTP with `mock.method(globalThis, "fetch", ...)`, and Trigger.dev chat streams with `tests/helpers/chat-server.ts`.
- Database tests run on in-memory PGlite with pgvector, built from `db/schema.ts`. Call `startTestDatabase()` (`tests/helpers/test-db.ts`) in `before()`, then `await import()` `@/db` and anything that imports it; a static import reaches for the real `DATABASE_URL` before the test database exists. Reference: `tests/api-v1-tenancy.test.ts`.
- Component tests (`.tsx`) import `./helpers/dom` (directly or through `./helpers/avatar-motion`) on their first line, before React, and `./helpers/css.mjs` when the component imports CSS. Reference: `tests/chat-composer.test.tsx`.

Verifying in the app

Local development uses production's database and E2B account, so anything you try there touches real data and spends real credits.

- Test with harmless messages on throwaway bots. Never send real messages or email, delete real data, reset a real computer, or spend credits as a test without asking. Never bypass ownership checks, plan limits or usage gates to make a test pass.
- `scripts/verify-*.ts` are opt-in live checks (`pnpm exec tsx --env-file=.env.local scripts/<name>.ts`), not part of `pnpm test`. Run one only when the user asks, and say first what it will spend. `verify-e2b.ts` creates a real bot and E2B desktop and spends Hobby credits. `verify-web-agent.ts` makes real Tavily searches and model calls. `verify-connector-agent.ts` makes model calls against live Composio schemas without executing a tool. `verify-chatgpt-auth.ts` writes and deletes rows in the shared database. `verify-computer-guard.ts` runs the computer-approval guard on the real vision model against screens rendered with local Chrome (three calls, under $0.01).
- Agents can't sign in to Clerk. For a signed-in page, ask the user to sign in in the preview or simulator (on the development instance, a `+clerk_test` email accepts the code `424242`), or report the page as unverified. A mock page doesn't count as checking it.

## Architecture

Each user-facing capability is written once in `services/` and exposed twice: to the web through a server action, and to the mobile app through `/api/v1`. Reference slice: `db/schema.ts` (`memoryUpdateSchema`), `services/memory.ts` (`updateMemory`), `actions/memory.ts`, `app/api/v1/memory/[memoryId]/route.ts`, `components/memory/memory-edit-dialog.tsx`.

Layers

- `services/<entity>.ts` holds the rules, queries and provider calls. Its first argument is `userId`, or a `Caller` (`{ userId, has }`, `services/caller.ts`) when it checks plan features. Services never call `auth()`, `currentUser()`, `headers()`, `cookies()` or `revalidatePath`; the action or route reads those and passes in values or callbacks (`firstName` in `createBot`).
- `actions/<entity>.ts` and `app/api/v1/**/route.ts` stay thin: authenticate, call the service, `revalidatePath`, return. Logic that lives only in an action is unreachable from the app. `actions/chatgpt.ts` predates services; don't copy it.
- `queries/` are read-only loaders for Server Components. Only `services/`, `lib/` and `trigger/` import `@/db`.
- Logic that the chat agent, its tools or the desktop gateway also need (provisioning, access and usage checks) lives in `lib/`, and services call it. `trigger/` imports `lib/`, `db/` and `neon.ts`, never `services/`, `queries/` or `actions/`.
- Put decisions (limits, ordering, parsing, ranking) in a pure `lib/<topic>.ts` with no `@/db`, provider SDK, Next.js or Sentry import, and test it in `tests/<topic>.test.ts` (`lib/pinned-bot-order.ts`). When effectful code needs a test, pass its provider calls in as parameters (`steps` in `deleteAccount`) instead of mocking modules.
- Client components import zod schemas from `db/schema.ts`, so keep that file and what it imports (`lib/memory-policy.ts`) browser-safe: no `@/db`, Node built-ins or server SDKs.

Tenancy

- `userId` comes only from the Clerk session: `auth()` in actions and queries, the `caller` from `apiRoute` in `/api/v1`. Never take it from input, params or client data.
- Scope every read and write by owner (`and(eq(table.id, id), eq(table.userId, userId))`). On a miss, throw `"<Thing> not found"` whether the row is missing or belongs to someone else. Check every client-supplied list of IDs against the owner's rows (`updateGroupChat` in `services/chats.ts`).
- For every new service function that takes a client-supplied ID, add a cross-account case to `tests/api-v1-tenancy.test.ts`.
- Gate paid features in the service with `caller.has({ feature })`. Code without a session (agent tools, per-turn checks) re-checks through Clerk's Backend API with `assertBotAccess` and `assertTeamAccess` (`lib/teammates.ts`) or `getAccountPlan` (`lib/usage.ts`).
- A create the client may retry (bots, group chats, For you tasks) takes a client-made `requestId`. Derive row IDs with `teamOperationId(userId, "<kind>", requestId)` (`lib/team-policy.ts`) and insert with `onConflictDoNothing`, so a retry returns the same row.

Errors

- Services throw plain `Error`s worded for the person. For `/api/v1`, `apiErrorResponse` (`lib/api-response.ts`) maps known messages to HTTP statuses: `/ not found$/` is 404, `/^Couldn't /` is 502 (report the cause with `Sentry.captureException` before throwing it), and any unlisted message becomes a 500 "Something went wrong". A new user-facing message needs a mapping there and a case in `tests/api-v1.test.ts`. Rewording an existing message can change its status.
- In production, React replaces the message of an error thrown from a server action with a generic one, so the web never sees service messages. Return outcomes the UI must explain (plan, usage or app limits) as data, `{ ok: false, ... }` (`CreateBotResult` in `services/bots.ts`).

## Next.js 16 in this repo

Upgrade guide: `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`.

- Request interception is `proxy.ts` (Clerk's `clerkMiddleware` plus a strict nonce CSP). Never add a `middleware.ts`.
- `params` and `searchParams` are Promises. Route handlers type the context as `{ params: Promise<{ botId: string }> }`.
- The root layout reads `headers()` for the CSP nonce, so every page renders per request. Don't try to make pages static, and give any new inline script the nonce.
- Cache Components is off. Don't use `"use cache"`, `cacheLife`, `cacheTag`, `revalidateTag` or `unstable_cache`; the guide that applies is `01-app/02-guides/caching-without-cache-components.md`. After a mutation, the action and the matching `/api/v1` route both call `revalidatePath("/", "layout")` when the change shows in the sidebar (bots, chats, pins), otherwise `revalidatePath` on the page that shows it (`"/memory"`, `"/workspace"`).
- `next lint` no longer exists, and `next build` doesn't lint.

## Native API

`app/api/v1` serves only the Expo app in the separate `krafty-mobile` repository (`~/krafty-mobile`, GitHub `drewsephski/krafty-mobile`). The web never calls it. Reference route: `app/api/v1/bots/[botId]/route.ts`.

Route handlers

- Give every new capability both a server action and a `/api/v1` route over the same service.
- Export each handler as `export const GET = apiRoute(async (caller, request, context) => ...)` from `@/lib/api`. `tests/api-v1-tenancy.test.ts` fails on any other form, including `export async function GET`. The one route without a session, the OAuth bridge `apps/connections/callback`, is listed in that test's `public_` set with its reason.
- `apiRoute` accepts only `Authorization: Bearer <Clerk session token>` and ignores cookies on purpose, so another site can't ride the Clerk cookie. Don't add a cookie fallback, CORS headers or `OPTIONS` handlers, and don't add `auth.protect()` for `/api` in `proxy.ts`: the app needs `apiRoute`'s JSON 401, not a sign-in redirect.
- Read bodies with `readJson(request)`, then parse them with the schema the service uses. Never copy a schema into a route.
- Return named keys (`{ bot }`, `{ chats }`), with status 201 for creates. Map rows through `publicBot` and `publicChat` (`lib/api-shapes.ts`) or select explicit columns, so `userId` and `sandboxId` never leave the server. Errors go out as `{ error: { code, message, issues? } }`, and the app branches on `code`.
- Build public URLs with `publicOrigin(request.headers)` from `lib/api-response.ts`. Behind Railway's proxy, `request.url` and `nextUrl.origin` are internal.
- A WebView can't set headers, so the desktop route returns a socket URL carrying a single-use, one-minute `?ticket=` (`lib/desktop-ticket.ts`). Never put a Clerk session token in a URL. `server.ts` handles WebSocket upgrades under `/api/chats/`, so don't add Next routes there.

Contract

- Installed app builds (TestFlight, OTA channels) call production and can't update in step with the server, so changes to `/api/v1` are additive only. The no-backwards-compatibility rule covers stored data, not this API. Never rename or remove a route, response field, accepted body field or error `code`. Keep the old one next to the new, with a comment saying which builds need it (`card` in `for-you/suggestions`, `token` in `for-you/tasks`). The server ships before any app build that calls a new route.
- The chat agent is part of the contract. The app streams from Trigger.dev directly with the token from `POST /api/v1/chats/:id/session` or `/token`, triggers the task id `chat`, and renders tool parts by name (`tool-askUser`, `tool-bash`, ...), the `messageSeen` and `followUps` data parts, and the message metadata. Renaming any of them breaks shipped builds.
- The mobile repo copies parts of this one by hand: form limits and messages from `db/schema.ts`, avatar shapes from `lib/bot-avatar.ts`, the API error codes, and the chat message types. When you change one of those, tell the user the app needs the matching change. Its `docs/parity.md` and `docs/release-checklist.md` cover parity and release order.
- Run `expo` and `eas` commands only in `~/krafty-mobile`. Run here, they offer to create an EAS project for this repo and leave a stray `app.json` behind; never commit it.

## Trigger.dev

Runtime

- `trigger/chat.ts` (the `chat` agent), `trigger/usage.ts` (the `meter-sandboxes` cron) and `trigger/init.ts` run on Trigger.dev, and so does everything they import: `db/`, `neon.ts` and most of `lib/`. `server.ts` and the gateway's modules (`lib/desktop-gateway*.ts`, `lib/desktop-ticket.ts`, `lib/e2b.ts`, `lib/sandbox-*.ts`, `lib/usage.ts`) run in plain Node outside Next's compiler.
- Code reachable from either must not import `next/*`, `server-only`, `@clerk/nextjs` or `@sentry/nextjs`. Use `createClerkClient` from `@clerk/backend` and `@sentry/node`, as `lib/usage.ts` does; type-only imports are fine. `services/`, `queries/`, `actions/` and `lib/api.ts` are Next-only.
- Import `chatAgent` from `@/trigger/chat` only with `import type`. A value import pulls the agent and its server modules into Next.
- Tasks other than the chat agent inherit 3 attempts from `trigger.config.ts`, in development too, so make them idempotent like `meter-sandboxes`.

chat.agent

Load the `trigger-authoring-chat-agent` skill before changing `trigger/chat.ts`.

- In `run()`, call the `streamText` the agent passes in, never the one from `ai`, and pass the prompt as `system` there: the managed wrapper merges only `system`, even on AI SDK 7. Inside `prepareStep`, return `instructions`.
- Declare tools through the agent's `tools` option, so `toModelOutput` runs again when earlier turns are replayed.
- Keep `chat.endRun()` in `respond()`, so the next message boots the current deployment. The agent never retries, and a failed turn leaves the run alive, so report turn errors in `onTurnComplete`; `tasks.onFailure` never sees them.
- `clientData` comes from the browser. It may only pick a `botId` among the chat's members, plus mentions (`chatClientDataSchema`). Anything the agent must trust, such as the For you account binding or the delegation depth, goes in server-side `sessions.start({ metadata })`, and the funding provider is always read from the database.
- Transcripts live in Neon (`chat_transcripts`, one row per chat, cascading with it), through the agent's `storage: chatTranscriptStorage` (`lib/chat-transcript-storage.ts`). Load them with `chat.createLoadTranscriptAction(chatTranscriptStorage)`. The adapter reads a legacy `defaultStorage` snapshot only for a live chat without a Neon row, preserving existing history until its first Neon save; all new saves go to Neon. Trigger.dev still holds session stream records and run data; see `docs/data-retention.md`.
- On the client, wrap the transport with `lib/chat-transport.ts` and never forward useChat's `abortSignal`. Trigger.dev treats an aborted send as Stop, so leaving the page would cancel the bot's turn.

## Autonomy: routines, approvals, activity

Bots act without a message from the person through three pieces. Read `docs/autonomy.md` before changing them.

- Routines (`routines` table, `lib/routines.ts`, `trigger/routines.ts`). The `run-routines` cron claims due rows with `FOR UPDATE SKIP LOCKED`, advances `nextRunAt` in the same transaction, then posts the prompt into the routine's chat with `postChatMessage` (`lib/chat-dispatch.ts`). It runs only in the production environment, because a dev worker would post through the development key; set `KRAFTY_DEV_ROUTINES=1` for the dev worker to test. Agent tools are in `lib/routine-tools.ts`; schedule math is pure in `lib/routine-policy.ts`.
- Server-sent turns. Never start a turn in an existing chat by re-calling `sessions.start` with a `basePayload.message`; Trigger.dev drops it once the session exists. Use `postChatMessage`, whose message ID is also the append's idempotency key. Message IDs mark unattended turns: `routine_`, `brief_` (delegation), `approval_`, `task_` (`unattendedOrigin`).
- Approvals (`approvals`, `approval_rules`, `lib/approvals.ts`, `lib/approval-policy.ts`). `executeAppTool` holds every connected-app write (Composio `destructiveHint`, or a write verb in the slug, or anything unrecognised) and returns `approval_required`; the turn stops. Deciding wakes the bot with a message naming the approval, and `runApprovedAction` runs the stored call once (`claimApproval`), never model-supplied arguments. "Always allow" adds a rule bound to the bot, action and connected account, never for a high-risk action (`appToolHighRisk`); rules are listed and removed through `/api/v1/approvals/rules`. Don't add a write path to connected apps that skips the gate.
- Computer approvals (`lib/computer-approval-policy.ts`, `lib/computer-approval-tools.ts`, `lib/computer-guard.ts`). `createSandboxTools` requires a `ComputerGate`: every click, drag, Enter and non-navigation key is checked by a separate vision-model guard on a server-taken screenshot, and risky shell commands are refused or held. A committing step runs only under a claimed `requestComputerApproval` for that bot and chat. The guard fails closed and is recorded under `ai:${runId}:${turn}:guard:<toolCallId>`. Don't add a computer input path that skips the gate, and read "What is enforced" in `docs/autonomy.md` before claiming more than it says.
- Activity and push (`activity_events`, `push_devices`, `lib/notify.ts`). Record what a bot did on its own with `recordActivity`, with a `dedupeKey`, so a retried task notifies once. Push goes through Expo; a failed push never fails the work.

## AI models and tools

- The AI SDK is v7 (`ai@7`, `@ai-sdk/react@4`, `@ai-sdk/openai@4`), newer than most training data; load the `migrate-ai-sdk-v6-to-v7` skill when unsure of a name. Use `isStepCount` (not `stepCountIs`), `onStepEnd` (not `onStepFinish`), `output: Output.object({ schema })` and `usage.inputTokenDetails.cacheReadTokens`.
- Call models with `streamText`, even for one-shot or structured output (`lib/generate-chat-follow-ups.ts`). The ChatGPT-plan provider can't run `generateText`.
- App-funded calls use `chatModel()` from `lib/model.ts`: the Neon AI Gateway through `@neon/ai-sdk-provider`, `glm-5-3-flash` for text and `gpt-5-6-luna` when the context holds an image. Never call `neon(...)` or `openai(...)` directly; `chatModel()` also converts tool screenshots to images, repairs replayed tool calls and sets the reasoning effort. Price every step with `chatModelCost`, which throws for a model missing from `modelPricing`.
- Embeddings use `neon.embeddingModel("qwen3-embedding-0-6b")`, whose 1024 dimensions match `memories.embedding`.
- A user on their ChatGPT plan gets the whole turn on `chatGPTModelForUser` (`lib/chatgpt-provider.ts`). It only streams, runs with `maxRetries: 0` and costs the app nothing, but web searches still use the Krafty allowance. Never fall back to `chatModel()` when a ChatGPT call fails. Read `docs/chatgpt-auth.md` before changing this path.

Agent tools

Reference: `lib/web-tools.ts` (`createWebTools`) and `tests/web-tools.test.ts`.

- Build tools in a `lib/<area>-tools.ts` factory with `tool({ description, inputSchema, execute })`. Inject clients, `fetch` and usage callbacks, so tests run offline.
- Register them in the `tools` callback of `trigger/chat.ts`, and decide whether the free plan gets them.
- Add the tool set's type to `ChatUIMessage` in `lib/sandbox-tools.ts`. Typecheck then requires a label and an icon in `components/chat-tool-call.tsx`.
- Describe the tool to the model in `lib/chat-instructions.ts` or an `*-instructions.ts` helper, including what to say when it is unavailable, and cover that in `tests/chat-instructions.test.ts`.
- Tool names are matched as strings in `trigger/chat.ts`, `lib/chat-activity.ts` and the mobile app. Grep for a name before renaming it.

## Billing and usage

- `usage_entries.amount` is millionths of a dollar for `ai` and seconds for `sandbox`. Plan allowances are `planLimits` in `lib/billing-policy.ts`.
- Anything that spends money for a user does three things. It checks `getUsage(userId).remaining` first, minus what the turn has spent but not yet recorded. It records the spend with `recordUsage` and a deterministic `idempotencyKey` built from the turn key `ai:${runId}:${turn}`. And it adds the cost to the turn's running total, so the stop condition ends the turn. Reference: the Tavily wiring in `trigger/chat.ts`, and `lib/teammate-consultation.ts`.
- A chat turn holds its running model cost in `usage_holds` under its ledger key (`holdUsage` in `onStepEnd`), and `getUsage` counts holds, so parallel turns on one account see each other and stop together; `recordUsage` releases the hold, and `run-routines` books holds abandoned for two hours. Free-plan turns no longer take an account lock.
- Clerk Billing is read through `getAccountPlan`, cached in `account_plans` for a minute and served stale for up to six hours only when Clerk fails (`lib/plan-cache.ts`). Pass `{ fresh: true }` where the person may have just upgraded.
- Idempotency keys are what prevent double charges. The free-plan path and `onTurnComplete` both write `ai:${runId}:${turn}` on purpose, so never change a key format in one place only.

E2B computers

- Each account has one computer, shared by all its bots: the `computers` table, `lib/account-computer.ts` (`ensureAccountComputer`, lock `computer:<userId>`). A turn takes its lease (`acquireComputerLease`, keyed by the turn's `ai:${runId}:${turn}`) on every computer call, and `onTurnComplete` releases it; `lib/computer-lease-policy.ts` holds the timings. `bots.sandboxId` is no longer read.
- Every E2B call goes through `lib/e2b.ts` (`withComputer`, `createAccountSandbox`, `pauseComputer`, `deleteSandbox`). It takes the advisory lock, meters before and after, and enforces the 55-minute session cap and the 5-minute idle pause. Never call `Sandbox.create` or `Sandbox.connect` anywhere else. Keep `metadata.app`, `lifecycle: { onTimeout: "pause", autoResume: false }` and `allowPublicTraffic: false` in `createAccountSandbox`, because metering and orphan cleanup depend on them. Metering and orphan cleanup find a computer's owner through `computers.sandboxId`.
- Check the user's remaining sandbox seconds before anything starts or resumes a computer.
- E2B stays on the Hobby plan. Never upgrade it or enable paid usage.

## Forms

Reference implementation: `db/schema.ts` (`groupChatInsertSchema`), `actions/chat.ts` (`createGroupChat`, `updateGroupChat`), `services/chats.ts`, `components/group-chat-dialog.tsx` (`GroupChatDialog`, `GroupChatForm`). For an edit form on a page: `components/memory/about-you-form.tsx`.

Schema

- Derive the validation schema from the Drizzle table with `createInsertSchema` from `drizzle-zod`, and export it from `db/schema.ts` next to the table. Do not hand-write a parallel zod object.
- `.omit()` every column the user must not supply: `id`, `userId`, timestamps, and anything generated server-side. A schema that edits a few columns of an existing row picks them instead with `.pick({ ... }).required()` (`memoryUpdateSchema`). Add fields that aren't columns with `.extend()` (`groupChatInsertSchema`).
- Put trimming, length limits and user-facing error messages in the schema refinements, so the client and the server share them.
- Export the inferred type (`z.infer<typeof schema>`) and use it as the action's argument type.
- An input schema that isn't derived from a table lives next to its service (`createBotInputSchema` in `services/bots.ts`) or in a pure `lib/` module, because a `"use server"` file may only export async functions. The `/api/v1` route imports the same schema.

Server action

- Actions live in `actions/<entity>.ts` with `"use server"` at the top of the file, and call a service (see Architecture).
- Start every action with `await auth()` from `@clerk/nextjs/server` (`const { isAuthenticated, userId, has } = await auth()`, or a file-local `caller()` helper as in `actions/chat.ts`) and throw if not authenticated. Always take `userId` from the session, never from the input.
- Pass the input to the service as it is. The service re-validates it with `schema.parse()`, so the action and the `/api/v1` route share one check; client validation is not trusted. The service also stores empty optional text as `null`.
- Then `revalidatePath` the affected route and return what the service returned: the saved row, or a result union when hitting a limit is an expected outcome (`CreateBotResult`).

Form component

- Use `react-hook-form` with `zodResolver(schema)` and the same schema the service uses. Give every field a `defaultValues` entry (`""` for text).
- Compose with `FieldGroup` + `Controller` + `Field`: `data-invalid` on `Field`, `aria-invalid` on the control, errors through `<FieldError errors={[fieldState.error]} />`. Never lay out fields with raw `div`s and `Label`.
- Submit by calling the server action inside `form.handleSubmit`, wrapped in `try/catch`. Report success and failure with `toast.add` from `@/components/ui/toast`.
- While submitting, disable the submit button and show `<Spinner data-icon="inline-start" />`. Non-submit buttons inside the form need `type="button"`.
- Generate random values (seeds, ids) in a `useState(() => ...)` initializer or an event handler, never directly during render.
- An edit form that stays mounted across `router.refresh()` passes the saved data as both `defaultValues` and `values`, with `resetOptions: { keepDirtyValues: true }`. It calls `form.reset(saved)` after saving and keeps submit disabled while `!isDirty` (`components/memory/about-you-form.tsx`).

Forms in dialogs

- Keep the form in its own component rendered inside `DialogContent`, so it mounts on open and its state resets every time.
- The dialog component owns the `open` state and its `DialogTrigger`; the form closes it through an `onSaved` callback after success.
- Put `DialogFooter` inside the `<form>` so the submit button works, and use `DialogClose` for Cancel: `<DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>`.

Dependencies

- `zod` must stay on v4 (`import { z } from "zod"`). If adding a package would move the top-level `zod` back to v3, pin `zod@^4` in the same `pnpm add` command rather than using `--force` or overrides.

## UI

Read `DESIGN.md` before changing application UI and `PRODUCT.md` before writing product or marketing copy; both are binding. When a change alters a rule that `DESIGN.md` describes, update `DESIGN.md` in the same change.

Components

- `components/ui/` is shadcn's `base-nova` style on Base UI (`@base-ui/react`), not Radix. Most shadcn examples, 21st.dev snippets and training data assume Radix and break here.
- Compose triggers with the `render` prop, never `asChild`: `<AlertDialogTrigger render={<Button variant="outline" />}>`. Style a link as a button with `className={buttonVariants()}`; a `Button` that renders a non-button element needs `nativeButton={false}`. Give `Select` an `items` map, so `SelectValue` shows the label instead of the raw value.
- Don't add `@radix-ui/react-*` primitives. Convert Radix code with the `migrate-radix-to-base` skill.
- Add a missing primitive with `pnpm exec shadcn add <name>`, but never overwrite existing files in `components/ui/` or `components/ai-elements/`. `button`, `dialog`, `scroll-area`, `sidebar`, the menus, `select`, and the AI Elements `tool`, `prompt-input`, `conversation`, `code-block` and `shimmer` carry project changes that callers rely on.
- Render chat markdown with `MessageResponse` from `@/components/ai-elements/message`. Don't import `streamdown` directly.
- Render a bot's identity with `ChatAvatar` (`components/chat-avatar.tsx`) from its stored `avatar`: a `blob:<shape>:<colorIndex>` character, or a DiceBear seed. Use `BotMark` directly only for decorative characters.

Style

- Style app UI only with the semantic tokens in `app/globals.css`. No Tailwind palette colors or literal hex in app chrome. Bot character colors identify bots and don't recolor the app. Don't add a font family or an accent palette unless the user asks for one.
- Dark is the default and light must keep working. A bare `d` keypress outside text fields toggles the theme, so don't bind `d` to anything else.
- Never show invented conversations, customers, usage, billing data, connected services or completed work as real state.
- Animate with `motion/react`. The reduced-motion rule in `app/globals.css` stops only CSS animation, so JS animations check `useReducedMotion()` and settle to a still state (`components/ai-elements/shimmer.tsx`).
- Import icons from `lucide-react`. `components/ui/search.tsx`, `arrow-up.tsx`, `chevron-down.tsx` and their siblings are animated icons that reuse lucide's names (`SearchIcon`, `ArrowUpIcon`) but render a `div` with a `size` prop, so check the import path.
- Give every icon-only button an `aria-label`, and put `role="status"` on text that announces async state.

Copy

- Show toasts with `toast.add({ type, title, description })` from `@/components/ui/toast`, a Base UI toast manager. Sonner isn't installed, so `toast.error()` and `toast.success()` don't exist.
- Write UI strings in sentence case, without exclamation marks. Error toasts are titled `Couldn't <do the thing>`, with the next step in the description ("Try again."). Success toasts state the result ("Bot settings saved").
- Write validation messages as short second-person sentences in the schema ("Give your bot a name.").
- The brand is `Krafty` and the product `Krafty Bot` (`brandName` and `productName` in `lib/marketing/site.ts`), never "Kraftybot". App labels call the entity a bot ("Create bot"); "teammate" belongs in descriptive sentences.

## Marketing pages

The public pages (`app/page.tsx`, `app/use-cases/`, `components/landing/bot/`) are a separate, dark-only surface reconstructed from x.ai/bot. Section specs are in `docs/research/x-ai-bot/components/`. Reference: `app/use-cases/page.tsx`.

- Wrap pages in `styles.landing` from `components/landing/bot/bot-landing.module.css`, and style them with CSS modules and literal dark values, not the app's semantic tokens, which flip in the light theme.
- Take the domain and names from `lib/marketing/site.ts`. Set `alternates.canonical` to a relative path, and emit structured data with `JsonLd` (`components/json-ld.tsx`). Point calls to action at `/workspace` when signed in, otherwise at `/sign-up?redirect_url=%2Fworkspace`.
- Add a new public page to `app/sitemap.ts`. Add a new signed-in route to the `disallow` list in `app/robots.ts` and to the `X-Robots-Tag` source pattern in `next.config.ts`.
- Plan limits and prices come from `planLimits` in `lib/billing-policy.ts`; derive copy from it, as `publicPlans` in `lib/marketing/site.ts` does. When a limit or price changes, also grep for the copy that hardcodes it ("one bot, one connected app", "$1 AI allowance", "$20").
- Only `components/landing/bot/`, `components/landing/pricing.tsx` and `components/landing/halftone-wordmark-footer.tsx` are live. The other top-level files in `components/landing/` are unused leftovers of the previous landing page; don't edit or copy from them.

## DiceBear

Use DiceBear 10. Documentation: https://www.dicebear.com/llms.txt

There are seven native cores with identical output, not one library with
wrappers. Use the one matching this project's language. Do not reach for the
JavaScript core when the project is written in something else:

    JavaScript  @dicebear/core + @dicebear/styles
    PHP         dicebear/core + dicebear/styles
    Python      dicebear-core + dicebear-styles
    Rust        dicebear-core + dicebear-styles
    Go          github.com/dicebear/dicebear-go/v10 + github.com/dicebear/styles/v10
    Dart        dicebear_core + dicebear_styles
    C#          DiceBear.Core + DiceBear.Styles

Every style page carries a loading snippet for all seven, for example
https://www.dicebear.com/styles/lorelei/index.md

HTTP API: https://api.dicebear.com/10.x/<style>/svg?seed=<seed> The seed is a
query parameter, not a path segment. Options are query parameters too; array
values are separated by commas.

Options named after a component end in Variant: eyesVariant, not eyes. This
holds in all seven cores and in the HTTP API. Look up the options of a style at
https://api.dicebear.com/10.x/<style>/options.json

Write these forms, not the ones on the left. The left column is pre-10 and the
API does not reject it, so an outdated call runs and silently does the wrong
thing:

    avatars.dicebear.com/api/<style>/<seed>.svg  ->  api.dicebear.com/10.x/<style>/svg?seed=<seed>
    api.dicebear.com/9.x/<style>/svg             ->  api.dicebear.com/10.x/<style>/svg
    npm install @dicebear/collection             ->  npm install @dicebear/styles
    npm install @dicebear/lorelei                ->  npm install @dicebear/styles
    createAvatar(lorelei, { seed })              ->  new Avatar(new Style(definition), { seed })
    { eyes: ['variant01'] }                      ->  { eyesVariant: ['variant01'] }
    ?radius=50                                   ->  ?borderRadius=50

Only JavaScript and the HTTP API have a pre-10 form. The other six cores were
released in 2026 and never had one, so any older-looking PHP, Python, Rust, Go,
Dart or C# API attributed to DiceBear is invented rather than outdated.

## Other skills and docs

More skills are installed in `.agents/skills/` (linked from `.claude/skills/`). Load the one that matches the code you touch: `ai-sdk` and `migrate-ai-sdk-v6-to-v7` for model calls and tools, `ai-elements` for `components/ai-elements/`, `shadcn` and `migrate-radix-to-base` for `components/ui/`, `clerk-nextjs-patterns` and `clerk-billing` for auth and plan features, `composio` for connected apps (`lib/composio.ts`), `neon-postgres` for the database and `use-railway` for the Railway service. Skip `daytona`: bot computers run on E2B, and nothing here uses Daytona.

- `docs/chatgpt-auth.md` and `docs/web-search.md` hold the current rules for ChatGPT sign-in and web research.
- `docs/research/` and `docs/memory-and-personalization.md` are dated research and proposals; memory has since shipped in Postgres. Where they disagree with the code, the code wins.

<!-- TRIGGER.DEV SKILLS START -->

## Trigger.dev agent skills

This project has Trigger.dev agent skills installed in `.agents/skills/`. Before writing or changing Trigger.dev code (background tasks, scheduled tasks, realtime, or chat.agent AI agents), load the most relevant skill: `trigger-authoring-chat-agent`, `trigger-authoring-tasks`, `trigger-chat-agent-advanced`, `trigger-cost-savings`, `trigger-getting-started`, `trigger-realtime-and-frontend`.
<!-- TRIGGER.DEV SKILLS END -->
