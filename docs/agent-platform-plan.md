# Agent platform plan

How Krafty Bot gets every app from chat, one shared computer per account as the fallback, computer approvals, and reusable workflows. The wire shapes the mobile app relies on are in `docs/agent-platform-contract.md`. Written 2026-10-16 at `3c17546` (Phase 0). Each phase stops for the owner's sign-off.

## Owners

| Owner       | Model      | Files                                                                                                                                                                                                                                                                                                                                                         |
| ----------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lead        | Opus 5.5   | Hotspots: `trigger/chat.ts`, `lib/sandbox-tools.ts` (`ChatUIMessage`), `lib/chat-instructions.ts`, `db/schema.ts`, `services/account.ts`, both docs. Runs `pnpm db:push`, integrates, runs the final checks.                                                                                                                                                  |
| Connectors  | Sonnet 5.5 | `lib/composio.ts`, `lib/connector-*.ts`, `lib/app-catalog*.ts`, `services/connectors.ts`, `actions/connectors.ts`, `app/api/v1/apps/**`, `lib/mobile-connector.ts`, `lib/agent-tool-instructions.ts`                                                                                                                                                          |
| Computer    | Sonnet 5.5 | `lib/e2b.ts`, `lib/account-computer.ts` (replaces `lib/bot-computer.ts`), `lib/computer-lease*.ts`, `lib/computer-approval*.ts`, `lib/sandbox-metering.ts`, `trigger/usage.ts`, `lib/billing-policy.ts`, `lib/desktop-gateway*.ts`, `lib/desktop-ticket.ts`, `lib/computer-login-policy.ts`, `lib/approvals.ts`, `lib/approval-policy.ts`, `docs/autonomy.md` |
| Web UI      | Sonnet 5.5 | `components/chat-tool-call.tsx`, `components/chat-question.tsx`, new `components/chat-app-connection.tsx`, `components/connector-marketplace.tsx` (extracting its connect hook), `components/desktop-panel.tsx`, `components/desktop-reset-dialog.tsx`, `components/approval-card.tsx`, workflows pages and forms, composer picker                            |
| Workflows   | Sonnet 5.5 | `services/workflows.ts`, `actions/workflows.ts`, `app/api/v1/workflows/**`, `lib/workflow-*.ts`, `lib/routines.ts`, `lib/routine-tools.ts`, routine routes, `lib/for-you-sources.ts`, `services/for-you.ts`, attachments                                                                                                                                      |
| Reviewer    | Opus 5.5   | Reviews the diff after each phase: tenancy, idempotency keys, billing and metering owner, lease races, the approval gate, contract additivity, secrets                                                                                                                                                                                                        |
| Test triage | Haiku 5.5  | `pnpm typecheck`, `pnpm test`, targeted `tsx --test` runs; summarizes failures                                                                                                                                                                                                                                                                                |

Agents run in parallel only on disjoint files. Hotspot edits go through the lead. Nobody branches, commits or deploys.

## Phase 0 findings

### Re-verified at `3c17546`

The prompt's "What exists" list holds, with these corrections:

- **`searchAppTools`, `getAppToolSchema`, `executeAppTool`, `runApprovedAction`** are AI SDK tools built inside `createAppTools` (`lib/connector-tools.ts:146`). `lib/connector-session.ts` only exports `createSessionRuntime`.
- **Session toolkit filter.** Only execution sessions are limited to connected toolkits (`sessionFor`, `lib/connector-session.ts:42-70`). The marketplace's catalog session and the authorize session pass no toolkit filter (`lib/composio.ts:68`, `:144`).
- **"This app requires a custom authentication setup."** (`services/connectors.ts:166`) never reaches the person. The catch at `:179` replaces it with "Couldn't start the connection. This app may require custom authentication…". The branch is also effectively dead: `redirect_url` is always set, and a toolkit without managed auth fails earlier inside `session.authorize`.
- **No computer approvals yet.** `components/approval-card.tsx` offers Approve, Always allow and Decline. `docs/autonomy.md` lists computer gating as "Not built yet".
- **Composer drop listener.** The composer has no attach control. `components/ai-elements/prompt-input.tsx:774` still listens for drops into hidden state that is never sent.
- **Approval rows need app fields.** `approvals.toolkit`, `toolSlug` and `accountId` are `NOT NULL`, so computer approvals fill them with sentinels (see the contract).
- **Paid features beyond computer access.** `sandboxes` gates the desktop gateway (`lib/desktop-gateway.ts:44`), `getDesktopUrl` and `resetDesktop` (`services/chats.ts:225`, `:258`). Group chats are paid (`trigger/chat.ts:590`) and stay paid; owner decision 6 gives group chats the computer, not free group chats.
- **Free allowances are one-time.** Free `period.start` is null, so `getUsage` sums every entry ever recorded (`lib/usage.ts:80-101`). A free `sandbox: 300` is therefore lifetime, as decision 4 wants.
- **Bot deletion deletes the bot's computer** (`services/bots.ts:193-201`). With one computer per account it must stop doing that.
- **Answered questions.** An answered card is a user message whose `metadata.questionId` is the askUser `toolCallId` (`components/chat.tsx:326`, `lib/chat-activity.ts:93`). `postChatMessage` can't set it yet.
- **Mobile build parsing.** Installed mobile builds humanize unknown tool names (`krafty-mobile/src/lib/chat/tools.ts`) and render any tool output with `status: "approval_required"` and `approvalId` as an approval card (`src/lib/approvals.ts`). `computerLogin` is parsed with a non-strict zod object, so a new `reason` is stripped.

### Composio `@composio/core` 0.23.0

Verified from the package's `.d.ts` and runtime, the composio skill and Composio's docs:

- **Catalog search with status:**
  - `session.toolkits({ search, limit ≤ 50, cursor })` on a session without a toolkit filter searches the whole catalog. It returns `{ slug, name, logo, isNoAuth, connection? }`; the marketplace already uses it (`connectorCatalog`).
  - It drops `composio_managed_auth_schemes`, and `connection.authConfig.isComposioManaged` is only set once connected. So it can't tell us whether an unconnected app is connectable.
- **Managed auth:** `composio.toolkits.getMany(slugs)` (`POST /toolkits/multi`) returns `composioManagedAuthSchemes` and `noAuth` per slug in one call. `toolkits.get(slug)` has the first but no `noAuth`. `toolkits.get({ search })` silently drops `search`; don't use it.
- **Project auth configs:** `composio.authConfigs.list({ isComposioManaged: false })` lists toolkits the project configured itself. Those are connectable too.
- **Connection status:** keep `activeAccounts(userId)`. It applies plan limits and account bindings. `session.toolkits` reports provider accounts the plan may hide.
- **Sessions:** a session without `toolkits` is unrestricted, and `manageConnections: { enable: false }` only removes the connect meta-tool. Execution sessions stay limited to connected toolkits, so the provider never picks an account. Discovery uses a separate unfiltered session that never executes.
- **Unverified, needing one live call:**
  - whether API-key-only toolkits (no OAuth managed scheme) are connectable through the hosted Connect link;
  - what `session.authorize` returns when a toolkit has no managed auth.
  - Until checked, `connectable = noAuth || composioManagedAuthSchemes.length > 0 || projectAuthConfig`. The card's server check is that same rule, and any failure to start the link falls back to the computer.

`findApps` per call: `session.toolkits` (1 call) plus `getMany` for slugs not in the worker's 6-hour cache (0-1 calls). The discovery session and the turn's accounts are memoized for the turn. Cold: about 4 calls. Warm: 1.

### E2B Hobby

- **Price:** $0.000014 per vCPU-second plus $0.0000045 per GiB-second, so about $0.00003 a second for the 2 vCPU desktop. The free 300 seconds cost about $0.01 per account, at most.
- **Concurrency:** Hobby caps sessions at 1 hour and **20 sandboxes running at once**. Paused sandboxes don't count. With free computers that cap is the real limit. Phase 3 maps E2B's rate-limit and quota errors to "Computers are busy right now. Try again in a few minutes."
- **Unverified:** how long E2B keeps paused sandboxes, and whether storage costs. See the owner questions.

## Decisions made in Phase 0

- **Connect card input** is `{ toolkit, name }`. The logo comes from the catalog, so the model can't inject an image URL.
- **`connect_` and `workflow_` messages are attended.** The person just acted, and treating them as unattended would block routine edits during the turn for no reason. Long turns still notify.
- **The wake goes to the bot that asked.** The card carries `botId`, and the server checks that it's a member of the chat. Group chats wake the right teammate.
- **One committing action per computer approval.** `claimApproval` (approved → running) happens inside the committing tool call. The call then records `executed` or `failed`, so an approval can't be replayed.
- **"Always allow" on a computer approval** acts as Accept and saves no rule. Old builds keep that button.
- **The lease key is the turn's ledger key** `ai:${runId}:${turn}`, which is unique per turn and already threaded through `trigger/chat.ts`.
- **Busy is a result, not an error,** as the owner proposed, so the model sees who has the computer and can say so.
- **App preferences live in a `jsonb` column** `userSettings.appPreferences` (`{ [toolkit]: { proactive?: false, work?: true } }`), replacing the never-read `suggestionApps`. Dropping `suggestionApps` waits until the code that ignores it is live (follow-up drop).
- **Screenshots shrink inside the computer.** Converting to a scaled JPEG with a command on the computer avoids adding `sharp`, a native module, to the Trigger.dev build. If the E2B desktop image lacks a converter, Phase 3 falls back to `sharp` as a direct dependency, with Trigger.dev's build config, and asks first.

## Owner answers (2026-10-16)

1. **Attachments:** option A (files uploaded into the account computer under `~/workspace/uploads/<chatId>/`), plus inline images under 5 MB sent to the model as file parts. No new service. Contract: `docs/agent-platform-contract.md`, "Phase 4: attachments".
   - Options B (Neon Object Storage), C alone (everything inline) and D (S3, R2, Vercel Blob) were declined.
2. **Retention:** a free-plan computer paused for 30 days is deleted, files included. This is built in Phase 3 with the free allowance: `computers.lastUsedAt` is set on every lease and the metering cron deletes the computer once it's 30 days old and the owner is on the free plan.
3. **Composio check:** Phase 1 adds `scripts/verify-app-catalog.ts` (read-only, no model calls, no connection) and runs it once.

## Phase 1: every app, connected from chat

| File                                                                                   | Owner                     | Change                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/app-catalog-policy.ts` (new, pure)                                                | Connectors                | `appCatalogEntry(toolkit, auth, accounts, tier)` gives `connected`, `connectable` and `blockedByPlan`; `appConnectionState`; the slug cache TTL                                                                            |
| `lib/app-catalog.ts` (new)                                                             | Connectors                | `findApps(userId, query, limit, deps)` with an injected Composio client, the 6-hour `getMany` cache and the per-worker auth-config set                                                                                     |
| `lib/app-catalog-tools.ts` (new)                                                       | Connectors                | `createAppCatalogTools({ find })`, exporting the `findApps` tool and the `AppCatalogTools` type                                                                                                                            |
| `lib/bot-setup-tools.ts`                                                               | Lead                      | `appConnectionSchema`, the `askUser` output schema with `appConnection`, and a `prepareAppConnection(input)` option that validates through the catalog and returns `{ logo, state }`. The fixed question and options.      |
| `lib/chat-dispatch.ts`                                                                 | Connectors                | `postChatMessage` takes an optional `metadata.questionId` and merges it with `displayPrompt`                                                                                                                               |
| `db/schema.ts`                                                                         | Lead                      | Additive nullable `chatId`, `questionId`, `botId` columns on `connectorAuthAttempts`. Push before the code ships.                                                                                                          |
| `lib/connect-wake.ts` (new)                                                            | Connectors                | `connectWakeMessageId(state)` gives `connect_<state>`. `connectWakePrompt(name)` and `wakeAfterConnect(userId, attempt)`, which rechecks the chat and member ownership, then posts.                                        |
| `lib/connector-callback.ts`                                                            | Connectors                | The attempt payload parser accepts the optional chat fields                                                                                                                                                                |
| `services/connectors.ts`                                                               | Connectors                | `beginAppConnection` and `beginMobileAppConnection` take `{ chatId?, questionId?, botId? }` and validate ownership (404 "Chat not found"). `finish*` returns `{ connected, woke? }` and wakes after a verified connection. |
| `actions/connectors.ts`                                                                | Connectors                | `connectApp(slug, context?)` and `completeAppConnection` return `{ connected, woke? }`. The web callers still read `connected`.                                                                                            |
| `app/api/v1/apps/connections/route.ts`, `complete/route.ts`, `lib/mobile-connector.ts` | Connectors                | Optional body fields and the `woke` response                                                                                                                                                                               |
| `lib/agent-tool-instructions.ts`                                                       | Connectors (lead reviews) | Order: connected app, then connect card, then computer. The work-data rule. What to say when tools are unavailable.                                                                                                        |
| `lib/chat-instructions.ts`                                                             | Lead                      | Free-plan and group paragraphs mention connect cards. Connect cards work in group chats.                                                                                                                                   |
| `trigger/chat.ts`                                                                      | Lead                      | Register `findApps` on every plan when Composio is configured. Wire `prepareAppConnection` with the turn's accounts and tier.                                                                                              |
| `lib/sandbox-tools.ts`                                                                 | Lead                      | Add `AppCatalogTools` to `ChatUIMessage`                                                                                                                                                                                   |
| `components/chat-app-connection.tsx` (new)                                             | Web UI                    | The card: logo, name, Connect button (popup pre-open and plan-limit toast reused from the marketplace through a shared `useConnectApp` hook), "Use the computer instead", "Not now"                                        |
| `components/connector-marketplace.tsx`                                                 | Web UI                    | Extract `useConnectApp` without changing behavior. The `/workspace` callback completes the attempt, and the cookie carries the chat context.                                                                               |
| `components/chat-question.tsx`, `components/chat-tool-call.tsx`                        | Web UI                    | Render the card for `appConnection`. `findApps` label and icon.                                                                                                                                                            |
| `lib/api-response.ts`                                                                  | Connectors                | No new message. "Chat not found" already maps to 404.                                                                                                                                                                      |

Tests:

- `tests/app-catalog-policy.test.ts`:
  - connected, connectable through managed, no-auth or project config;
  - not connectable;
  - free plan blocked, and not blocked for the connected toolkit;
  - paid plan never blocked.
- `tests/app-catalog-tools.test.ts`: `findApps` with an injected fake client covering cache hits (no second `getMany`), the limit cap of 50, and an unconfigured server.
- `tests/bot-setup.test.ts`: `appConnection` rejected when unknown, not connectable or already connected; `planLimit` state; fixed options; a model-supplied logo ignored.
- `tests/connect-wake.test.ts`:
  - the message ID is `connect_<state>`, and a repeat completion posts the same ID;
  - `questionId` metadata is sent;
  - no wake without `chatId`;
  - no wake for a chat or bot the user doesn't own;
  - a failed post returns `woke: false`.
- `tests/chat-dispatch.test.ts`: `questionId` and `displayPrompt` metadata together.
- `tests/api-v1-tenancy.test.ts`: another account's `chatId`, and a `botId` not in the chat, on `POST apps/connections` both give 404.
- `tests/api-v1.test.ts`: the `woke` field, and 400 for `questionId` without `chatId`.
- `tests/chat-instructions.test.ts`: the connect order, the computer fallback for custom auth, work-data confirmation, the unconfigured-Composio text, and connect cards allowed in group chats.

## Phase 2: one computer per account

Interfaces (frozen for the Phase 2 agents, 2026-10-16). The `computers` table is pushed.

```ts
// lib/computer-lease-policy.ts (pure)
export const LEASE_TTL_MS = 2 * 60_000 // expires this long after the last computer call
export const LEASE_WAIT_MS = 60_000 // how long a tool waits for another turn's lease
export const LEASE_POLL_MS = 2_000
export type Lease = {
  runKey: string | null
  botId: string | null
  chatId: string | null
  expiresAt: Date | null
}
export type LeaseHolder = { runKey: string; botId: string; chatId: string } // runKey = ai:<runId>:<turn>
export function leaseDecision(
  lease: Lease,
  me: LeaseHolder,
  now: number
): "take" | "renew" | "wait"
export function leaseExpiry(now: number): Date
export function busyResult(name: string): { status: "busy"; heldBy: string }

// lib/account-computer.ts (replaces lib/bot-computer.ts; Trigger.dev- and gateway-safe)
export function ensureAccountComputer(userId: string): Promise<string> // sandbox ID; lock computer:<userId>
export function acquireComputerLease(
  userId: string,
  holder: LeaseHolder,
  options?: {
    waitMs?: number
    pollMs?: number
    sleep?: (ms: number) => Promise<void>
  }
): Promise<
  { ok: true } | { ok: false; heldBy: { botId: string; name: string } }
>
export function releaseComputerLease(
  userId: string,
  runKey: string
): Promise<void>
export function computerInUseBy(
  userId: string
): Promise<{ botId: string; name: string } | null>
export function resetAccountComputer(userId: string): Promise<string> // explicit reset of a missing computer
export function pauseAccountComputer(userId: string): Promise<void>
export function deleteAccountComputer(userId: string): Promise<void> // deleteAccount step

// lib/e2b.ts renames: withBotSandbox → withComputer, getBotSandboxInfo → getComputerInfo,
// renewBotDesktop → renewComputerDesktop, pauseBotSandbox → pauseComputer,
// createBotSandbox(botId) → createAccountSandbox(userId), getBotDesktopConnection → getDesktopConnection,
// deleteBotSandbox → deleteSandbox, meterBotSandbox → meterSandbox, listBotSandboxes → listAppSandboxes.
// resetBotSandbox moves into resetAccountComputer. Owners resolve through computers.sandboxId.

// services/chats.ts (web and /api/v1)
getDesktopUrl(caller, chatId) // any owned chat → { missing: true } | { missing: false, url, inUseBy }
resetDesktop(caller, chatId)
pauseDesktop(userId, chatId) // any owned chat; the account computer
getChatTurnStatus(userId, chatId) // + inUseBy
```

| File                                                                  | Owner           | Change                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `db/schema.ts`                                                        | Lead            | New `computers` table: `userId` primary key, `sandboxId` (unique, nullable), `leaseBotId`, `leaseChatId`, `leaseRunKey`, `leaseExpiresAt`, `lastUsedAt`, `createdAt`, `updatedAt`. `bots.sandboxId` stays, unread (follow-up drop).                                                        |
| `lib/computer-lease-policy.ts` (new, pure)                            | Computer        | `LEASE_TTL_MS` (2 minutes), `LEASE_WAIT_MS` (60s), `LEASE_POLL_MS` (2s), `leaseDecision(lease, me, now)` (take, renew or wait), `leaseExpiry(now)`, `busyResult(name)`                                                                                                                     |
| `lib/account-computer.ts` (new; deletes `lib/bot-computer.ts`)        | Computer        | `ensureAccountComputer(userId)` under lock `computer:<userId>`, with the same lost-UPDATE handling. `acquireComputerLease`, `renewComputerLease`, `releaseComputerLease(userId, runKey)`, `computerInUseBy(userId)`.                                                                       |
| `lib/e2b.ts`                                                          | Computer        | `createAccountSandbox(userId)` (`metadata: { app, userId, creationId }`, same lifecycle, network and pause). `resetAccountSandbox(userId, oldId)`. Metering and `deleteOrphanSandbox` resolve owners through `computers.sandboxId`. Renames `withBotSandbox` to `withComputer`, and so on. |
| `lib/sandbox-metering.ts`, `trigger/usage.ts`                         | Computer        | The owned set comes from `computers`. Old per-bot sandboxes become orphans and are killed by the existing 24-hour rule.                                                                                                                                                                    |
| `lib/sandbox-tools.ts`                                                | Lead            | `createSandboxTools(getComputer)`, where `getComputer` returns the ID or a busy result. Descriptions say "the computer".                                                                                                                                                                   |
| `trigger/chat.ts`                                                     | Lead            | `getComputerId` checks remaining seconds, then takes or renews the lease with the turn key, waiting up to 60s. `onTurnComplete` releases. A handoff keeps the turn's lease. Busy unattended turns record `work_failed` with "<bot> couldn't use the computer: <other> was using it."       |
| `services/bots.ts`                                                    | Computer        | Bot deletion no longer deletes a computer                                                                                                                                                                                                                                                  |
| `services/account.ts`                                                 | Lead            | `deleteAccount` step `deleteComputer(userId)` kills the sandbox, and the `computers` row goes in the transaction. Test with fake steps.                                                                                                                                                    |
| `services/chats.ts`                                                   | Computer        | `getDesktopUrl`, `resetDesktop` and `pauseDesktop` work on owned direct and group chats and the account computer. They return `inUseBy`. `getChatTurnStatus` adds `inUseBy`.                                                                                                               |
| `lib/desktop-gateway.ts`, `lib/desktop-ticket.ts`                     | Computer        | The ticket still binds user and chat. The gateway accepts any owned chat and streams the account computer. (Ask before restarting `pnpm dev`.)                                                                                                                                             |
| `components/desktop-panel.tsx`, `components/desktop-reset-dialog.tsx` | Web UI          | Show "In use by <bot>". The reset and pause copy says every bot shares the computer. The panel is available in group chats.                                                                                                                                                                |
| `lib/chat-instructions.ts`                                            | Lead            | The computer is shared by all the person's bots; work goes under `~/workspace/<project>/`; check sign-in before `computerLogin`; an app connection doesn't sign the browser in                                                                                                             |
| `AGENTS.md`, `docs/autonomy.md`, `README.md`, `DESIGN.md`             | Lead / Computer | Rename references to the per-bot computer and its functions                                                                                                                                                                                                                                |

Tests:

- `tests/computer-lease-policy.test.ts`:
  - a free lease is taken;
  - the same turn renews;
  - another turn waits;
  - an expired lease is taken over;
  - after release, another turn takes it;
  - the 60s wait ends busy.
- `tests/account-computer.test.ts` (PGlite):
  - lease rows under two concurrent acquires, where exactly one wins;
  - release only by the holder's run key;
  - `inUseBy` hides expired leases.
- `tests/sandbox-metering.test.ts`: the owner comes from `computers`; an old per-bot sandbox is an orphan.
- `tests/account-deletion.test.ts` (existing deletion tests): the computer step runs and the row is gone.
- `tests/api-v1-tenancy.test.ts`: `desktop`, `desktop/reset` and `desktop/pause` with another account's group chat give 404.
- `tests/chat-instructions.test.ts`: the shared-computer wording, and no "sandbox of your own" text.

## Phase 3: computer for everyone, approvals, group chats

| File                                                                                                                                            | Owner             | Change                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/billing-policy.ts`                                                                                                                         | Computer          | `planLimits.free.sandbox = 300`                                                                                                                                                                                                                      |
| `lib/sandbox-metering.ts`, `trigger/usage.ts`, `lib/computer-retention-policy.ts` (new, pure)                                                   | Computer          | Delete free-plan computers whose `lastUsedAt` is 30+ days old and that are paused. The plan comes from `getAccountPlan`; a Clerk failure skips the account.                                                                                          |
| `trigger/chat.ts`                                                                                                                               | Lead              | Sandbox tools on the free plan; team, consultation and handoff stay paid. A free-plan computer step cap (20 computer tool calls per turn). Register `requestComputerApproval`.                                                                       |
| `lib/computer-login-policy.ts`, `lib/desktop-gateway.ts`, `services/chats.ts`                                                                   | Computer          | Remaining seconds replace the paid and direct-chat checks                                                                                                                                                                                            |
| `lib/sandbox-tools.ts`                                                                                                                          | Lead              | `commits` and `approvalId` on `mouseClick`, `keyboardPress` and `keyboardType`. Screenshots as scaled JPEG (768 wide, quality 60) made on the computer. E2B quota and rate errors become "Computers are busy right now. Try again in a few minutes." |
| `lib/computer-approval-policy.ts` (new, pure)                                                                                                   | Computer          | `computerActionSchema`, `computerApprovalSlug(action)`, `committingAllowed(approval, bot, chat)`, the decision prompts with "check the screen again"                                                                                                 |
| `lib/computer-approval-tools.ts` (new)                                                                                                          | Computer          | `requestComputerApproval` creates the row (kind `computer`), notifies and stops the turn; `claimComputerApproval` inside committing calls                                                                                                            |
| `db/schema.ts`                                                                                                                                  | Lead              | `approvalKind` enum (`app`, `computer`), `approvals.kind` (default `app`), `hostname`, `action`. `approvalDecisionSchema` is unchanged.                                                                                                              |
| `lib/approvals.ts`, `services/approvals.ts`                                                                                                     | Computer          | Expose `kind`, `hostname`, `action`. `always` on computer approvals saves no rule.                                                                                                                                                                   |
| `lib/bot-setup-tools.ts`                                                                                                                        | Lead              | `computerLogin.reason`, with question and options per reason                                                                                                                                                                                         |
| `components/approval-card.tsx`                                                                                                                  | Web UI            | The computer variant: **Accept** / **Decline**, showing the hostname                                                                                                                                                                                 |
| `lib/chat-instructions.ts`                                                                                                                      | Lead              | Free-plan paragraph rewritten for 300 seconds. No "no Desktop in group chats". Prefer `bash` and text extraction to screenshots. Declare `commits`.                                                                                                  |
| `lib/marketing/site.ts`, `components/landing/pricing.tsx`, and copy found by grep ("no computer", "paid plan" near computer, "$1 AI allowance") | Web UI            | Free plan copy derived from `planLimits`                                                                                                                                                                                                             |
| `docs/autonomy.md`, `DESIGN.md`, `PRODUCT.md`                                                                                                   | Computer / Web UI | Computer gating, and that enforcement depends on the model declaring `commits`                                                                                                                                                                       |

Tests:

- `tests/computer-approval-policy.test.ts`:
  - a commit without an approval is refused;
  - a commit with another bot's or chat's approval is refused;
  - pending and denied approvals are refused;
  - an approved one is claimed once and a second claim is refused;
  - `always` saves no rule.
- `tests/sandbox-tools.test.ts`: `commits: true` without `approvalId` fails before touching the computer; JPEG output in `toModelOutput`; the busy result.
- `tests/billing-policy.test.ts`: the free sandbox is 300, and lifetime.
- `tests/computer-login-policy.test.ts`: allowed in direct and group chats on every plan while computer seconds remain; refused only when the allowance is used up (free or paid).
- `tests/api-v1.test.ts`: the approvals response includes `kind`, `hostname` and `action`.
- `tests/chat-instructions.test.ts`: the free-plan computer text, group sign-in, `commits` guidance, reasons.

## Phase 4: workflows, attachments, sensitive data

| File                                                                                                  | Owner            | Change                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db/schema.ts`                                                                                        | Lead             | `workflows` table (`id` from `teamOperationId`, `userId`, `botId` set null on delete, `name`, `description`, `instructions`, `inputs` jsonb, `toolkits` text[], `lastRunAt`, timestamps). `workflowInsertSchema` and `workflowUpdateSchema` per the Forms rules. `routines.workflowId` (set null) and `routines.workflowInputs`. `userSettings.appPreferences`. |
| `lib/workflow-policy.ts` (new, pure)                                                                  | Workflows        | Input validation against fields, the run prompt, limits (free 1, paid 50), `workflowMessageId(op)`                                                                                                                                                                                                                                                              |
| `services/workflows.ts`, `actions/workflows.ts`, `app/api/v1/workflows/**`                            | Workflows        | CRUD and run, as in the contract                                                                                                                                                                                                                                                                                                                                |
| `lib/workflow-tools.ts` (new)                                                                         | Workflows        | `saveWorkflow`, `listWorkflows`, `runWorkflow`. Saving is refused during unattended turns, like routines.                                                                                                                                                                                                                                                       |
| `lib/routines.ts`, `lib/routine-tools.ts`, `trigger/routines.ts`, routine routes                      | Workflows        | Workflow-linked routines build their prompt from the workflow                                                                                                                                                                                                                                                                                                   |
| `trigger/chat.ts`, `lib/sandbox-tools.ts`, `lib/chat-instructions.ts`                                 | Lead             | Register the tools. Interview before saving. Grade posting always goes through computer approval. Workflow files go under `~/workspace/<workflow>/`.                                                                                                                                                                                                            |
| `app/(dashboard)/workflows/**`, `components/workflows/**`, composer picker                            | Web UI           | Workflows page and form, plus a picker in the composer menu to run one with inputs                                                                                                                                                                                                                                                                              |
| `app/robots.ts`, `next.config.ts`                                                                     | Web UI           | `/workflows` in disallow and the `X-Robots-Tag` pattern (run `pnpm build`)                                                                                                                                                                                                                                                                                      |
| `services/account.ts`                                                                                 | Lead             | Delete `workflows` in the transaction                                                                                                                                                                                                                                                                                                                           |
| `lib/for-you-sources.ts`, `services/for-you.ts`, `services/connectors.ts`, `/api/v1/apps/preferences` | Workflows        | Proactive opt-out and `work` flag. The flags reach the agent's instructions.                                                                                                                                                                                                                                                                                    |
| `lib/attachment-policy.ts` (new, pure)                                                                | Workflows        | Limits (25 MB per file, 10 per message, 5 MB and 4 per message for inline images), allowed image types, `attachmentPath(chatId, id, name)` with filename sanitizing, and the metadata schema                                                                                                                                                                    |
| `services/attachments.ts`, `app/api/v1/chats/[chatId]/attachments/route.ts`, `actions/attachments.ts` | Workflows        | Checks the owned chat and remaining computer seconds, then writes into the account computer with `withComputer`. Returns the attachment or `{ ok: false, usageLimit: "sandbox" }`. The web upload path follows the Next 16 body-size docs, read in Phase 4.                                                                                                     |
| `trigger/chat.ts`, `lib/chat-attachments.ts` (new)                                                    | Lead / Workflows | Validates `metadata.attachments` (path prefix, counts) and inline image parts (type, decoded size). Drops anything else with a note to the model, and tells the model where uploaded files are.                                                                                                                                                                 |
| `components/chat-composer.tsx`, `components/chat.tsx`                                                 | Web UI           | Attach button and chips through the AI Elements `PromptInput` attachments. Uploads go first, then the message is sent with metadata and inline images.                                                                                                                                                                                                          |

Tests:

- `tests/workflow-policy.test.ts`.
- `tests/workflows.test.ts` (PGlite): CRUD, `requestId` retry, limits, and the run posting `workflow_<op>` through an injected dispatcher.
- `tests/api-v1-tenancy.test.ts`: every workflow route with another account's workflow, chat and bot.
- `tests/api-v1.test.ts`: "Workflow not found" maps to 404.
- `tests/routines.test.ts`: workflow prompts.
- `tests/for-you-sources.test.ts`: excluded apps are skipped.
- `tests/attachment-policy.test.ts`: limits, sanitized names (`../`, NUL, very long names), prefix check.
- `tests/chat-attachments.test.ts`: forged paths outside the chat's folder, oversized or non-image inline parts dropped.
- `tests/api-v1-tenancy.test.ts`: attachments upload into another account's chat gives 404.
- `tests/chat-instructions.test.ts`: interview first, grading approval, work confirmation, uploaded file locations.

## Phase 5: live verification

- Budget: $0.50, with a ledger of model cost (`chatModelCost`), Tavily credits and E2B seconds at about $0.00003 each.
- Use one throwaway bot and harmless tasks only:
  - `findApps` for "google sheets";
  - a connect card that is shown but not connected, unless the owner offers a test account;
  - the computer opening example.com under the free allowance;
  - a computer approval on a local test form with no real submission;
  - a saved workflow run once.
- The owner signs in for signed-in pages.
- Report:
  - per phase, what shipped;
  - the ledger;
  - what's unverified;
  - the Trigger.dev deploy reminder;
  - the follow-up drops of `bots.sandboxId` and `userSettings.suggestionApps`;
  - env vars (none expected);
  - mobile changes, with the contract table set to `server ready`.

## Risks

- **Lease starvation.** A turn that crashes holds the computer for at most 2 minutes past its last call.
- **Approval enforcement trusts `commits`.** A model that clicks "Submit" without declaring it isn't stopped. The instructions, the hostname in the approval, and the step cap reduce this; `docs/autonomy.md` says so plainly.
- **E2B's 20-running cap** under free computer use. Busy errors are clear, and E2B is never upgraded.
- **Shared files across bots** means one bot can overwrite another's work. Per-project folders under `~/workspace/` are the convention.
- **The old per-bot computers are killed** after the Phase 2 deploy (orphan rule). Their files are lost, which `AGENTS.md` accepts.
