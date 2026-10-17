# Agent platform contract (server ↔ mobile)

What the server promises the Krafty mobile app (`~/krafty-mobile`) for the agent platform work: connecting apps from chat, the shared account computer, computer approvals, and reusable workflows. The plan behind it is `docs/agent-platform-plan.md`.

Written 2026-10-16 at `3c17546` (Phase 0). The mobile session builds from this file. Where this file and the code disagree once a phase reaches `server ready`, the code wins and this file gets fixed.

## Rules

- **Additive only.** No route, response field, accepted body field, error `code`, tool name, data part or metadata key is renamed or removed. Every new request field is optional. Installed builds keep working without changes.
- **Server first.** A phase reaches `server ready` when its server code is merged and this file matches it. The app starts calling a new route only after its phase is at least `server ready` and the Railway and Trigger.dev deploys have shipped.
- **Ignore what you don't know.** New fields appear on existing objects. The app must accept unknown fields and enum values, which current builds already do: they parse with non-strict zod objects and humanize unknown tool names.

## Phase status

The mobile session reads this table. `planned` means the shapes below may still change. `server ready` means they are frozen and the server implements them. `shipped` means production runs it (Railway and the Trigger.dev worker are deployed).

| Phase | Scope                                                                                                                                     | Status       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1     | `findApps`, connect card (`askUser.appConnection`), connection attempts with `chatId`/`questionId`/`botId`, wake on connect               | shipped      |
| 2     | One computer per account, turn lease, `inUseBy`, desktop in group chats                                                                   | shipped      |
| 3     | Free computer allowance, `requestComputerApproval`, server-checked computer gestures, `approvals.kind`, `computerLogin.reason`, rules API | server ready |
| 4     | Workflows (routes, tools, routine link), app preferences (proactive opt-out, work apps), attachments (computer upload plus inline images) | planned      |

## Message ID prefixes

The server posts user-role messages into chats with `postChatMessage` (`lib/chat-dispatch.ts`). The message ID is the append's idempotency key and marks the turn's origin. `unattendedOrigin` (`lib/routine-policy.ts`) decides which origins mean "nobody is watching".

| Prefix                       | Origin                                                              | Unattended | Status   |
| ---------------------------- | ------------------------------------------------------------------- | ---------- | -------- |
| `routine_<id>_<scheduledAt>` | routine run                                                         | yes        | existing |
| `approval_<id>_<decision>`   | owner's approval decision                                           | yes        | existing |
| `brief_<op>`                 | delegation                                                          | yes        | existing |
| `task_<op>`                  | For you task                                                        | yes        | existing |
| `connect_<state>`            | an app connection started from a connect card finished              | **no**     | Phase 1  |
| `workflow_<op>`              | a workflow run started on demand (`POST /api/v1/workflows/:id/run`) | **no**     | Phase 4  |

- `connect_` and `workflow_` are attended because the person just acted and is usually still in the chat. A turn that lasts two minutes or more still notifies, as every turn does today.
- A scheduled workflow run comes from its routine and uses `routine_`.
- Server-posted messages carry `metadata.displayPrompt`, which the app shows in place of the message text. That isn't new. New: a `connect_` message also carries `metadata.questionId`, the `toolCallId` of the connect card it answers, so the card renders as answered like any other answered question.
- `GET /api/v1/chats/:id/origin` is about delegation (where a chat was handed over from). Nothing here changes it.

## Tools the app renders

The app renders tool parts by name (`tool-<name>`). Current builds give an unknown name a humanized title ("Find apps") and a generic status row. So every new tool degrades to a readable row with no extra work.

Suggested titles (running / done), the same as the web's `components/chat-tool-call.tsx`:

| Tool                      | Running             | Done               | Phase |
| ------------------------- | ------------------- | ------------------ | ----- |
| `findApps`                | Finding apps        | Found apps         | 1     |
| `requestComputerApproval` | Requesting approval | Approval requested | 3     |
| `saveWorkflow`            | Saving workflow     | Saved workflow     | 4     |
| `listWorkflows`           | Listing workflows   | Listed workflows   | 4     |
| `runWorkflow`             | Starting workflow   | Started workflow   | 4     |

### `findApps` (Phase 1)

Searches the whole Composio catalog for the person, connected or not.

Input:

```ts
{ query: string /* 1-100 chars, plain English: "zillow", "school grades" */, limit?: number /* 1-10, default 5 */ }
```

Output:

```ts
{
  configured: boolean // false when connected apps aren't set up on this server
  apps: {
    toolkit: string // Composio toolkit slug, e.g. "googlesheets"
    name: string // "Google Sheets"
    logo: string | null // https URL
    connected: boolean // the person has an active account the plan allows
    connectable: boolean // a Connect link works without custom auth (Composio-managed auth or no auth)
    blockedByPlan: boolean // free plan at its one-app limit, and this app isn't the connected one
  }
  ;[]
}
```

Nothing in the app needs to read the output. A generic row is enough.

### `askUser` additions

`askUser` keeps its input and output: `{ question, options, computerLogin? }`. Two additions, both optional on the output.

**`appConnection` (Phase 1): the connect card.**

The bot asks with `appConnection: { toolkit, name }`. The server checks that the toolkit exists in the catalog, is connectable and isn't already connected. Otherwise the tool fails and the model falls back to the computer. The output:

```ts
{
  question: string // e.g. "Connect Google Sheets so I can read your league data."
  options: ["I've connected it", "Use the computer instead", "Not now"] // fixed
  appConnection: {
    toolkit: string
    name: string
    logo: string | null // from the catalog, never from the model
    state: "connect" | "planLimit" // planLimit: the free plan's one app is used by another toolkit
  }
}
```

- **New builds** render a card with the app's logo and name, plus:
  - for `state: "connect"`, a **Connect** button that runs the existing mobile connect flow (`POST /api/v1/apps/connections`) with the new `chatId`, `questionId` (the askUser part's `toolCallId`) and `botId` (the bot that asked, which is the message's `metadata.botId`);
  - for `state: "planLimit"`, the plan-limit state (upgrade, or manage apps), the same as the Apps screen's.
  - Either way, "Use the computer instead" and "Not now" answer the question like normal options (`metadata.questionId` = `toolCallId`).
- **After Connect succeeds,** the server wakes the bot with `connect_<state>`, which answers the card. The app sends nothing else. If `POST apps/connections/complete` returns `woke: false`, the app sends "I've connected it" as the answer itself.
- **Reconnect (server ready):** the card may carry `reconnect: true` when the person's earlier connection expired or was revoked. New builds label the button **Reconnect**; the question already says the connection expired. Old builds strip it and show Connect, which works the same.
- **Old builds** see a plain question with the three options. "I've connected it" makes the bot check the connection and continue. "Use the computer instead" makes it use the computer.

**`computerLogin.reason` (Phase 3): handoff for any blocking step.**

```ts
computerLogin: {
  service: string
  hostname: string
  reason?: "sign-in" | "verification" | "captcha" | "payment" // absent means "sign-in"
}
```

- New builds may change the card's wording per reason ("Finish the verification step in Desktop", "Complete the payment in Desktop").
- The question and options the server writes already carry the right wording. Options stay `["I'm signed in", "Cancel sign-in"]` for `sign-in`, and for every other reason are `["I'm done", "Cancel"]`.
- Old builds strip the unknown `reason`, show their sign-in card, and work, because "Open sign-in" opens Desktop.
- From Phase 3, `computerLogin` works in group chats too.

### Approvals from the computer (Phase 3)

The server checks every click, drag, Enter and non-navigation key, and risky shell commands, before they run (`docs/autonomy.md`, "Computer approvals"). It doesn't rely on the model declaring anything: the planned `commits` field was dropped.

`requestComputerApproval` holds a committing computer step for the owner. Input:

```ts
{
  action: "submit" | "post" | "send" | "delete" | "buy"
  summary: string // 1-300 chars, one sentence of what will happen
  hostname: string // the site, same rule as computerLogin.hostname
  command?: string // a shell command needing approval; only this exact command runs
}
```

Output, the same shape as `executeAppTool`'s held result:

```ts
{ status: "approval_required", approvalId: string, summary: string, toolkit: string /* the hostname */, message: string }
```

- **Installed builds** render `approval_required` as a card only for `executeAppTool` (`src/lib/chat/rows.ts`), so they show `requestComputerApproval` as a generic row. The approval still reaches them through the push notification and the Activity screen, where it can be decided. New builds render it as an approval card.
- The computer input tools (`mouseClick`, `mouseDrag`, `keyboardPress`, `keyboardType`) and `bash` gain an optional input field `approvalId`. Their output doesn't change. A held step fails with an error (`output-error`) whose text starts "Approval required:", or says the owner declined this kind of action, or that the safety check couldn't run. New builds should show these as calm status rows ("Waiting for your approval"), not failures.

Accepting wakes the bot with the existing `approval_<id>_approve` message. The bot checks the screen again, then repeats the step with the `approvalId`, which covers that step and a confirmation right after it (at most three checked steps within 90 seconds).

### Computer tools while another bot has the computer (Phase 2)

Every computer tool (`bash`, `readFile`, `writeFile`, `listFiles`, `mouse*`, `keyboard*`, `viewScreen`, `showScreen`) may return:

```ts
{ status: "busy", heldBy: string /* the other bot's name */ }
```

This comes back after the tool has waited up to 60 seconds for the turn holding the computer. Current builds show it as a finished row. The bot then explains in text. New builds may show "Waiting for <heldBy>" or "<heldBy> is using the computer".

### Workflow tools (Phase 4)

`saveWorkflow`, `listWorkflows` and `runWorkflow` use the same shapes as the routes below (`saveWorkflow` input is the create body; `runWorkflow` input is `{ workflowId, inputs }`). Generic rows are enough.

## `/api/v1` changes

Every route keeps `apiRoute` auth (`Authorization: Bearer <Clerk session token>`) and the error body `{ error: { code, message, issues? } }`.

### Phase 1: connections

`POST /api/v1/apps/connections`

```ts
// body: existing fields, plus
{
  slug: string
  returnUrl: string
  chatId?: string // the chat the connect card is in; must be the caller's
  questionId?: string // the askUser toolCallId; 1-200 chars; requires chatId
  botId?: string // the bot that asked; must be a member of chatId; requires chatId
}
```

- Response unchanged: 201 `{ ok: true, url, accountId, state }`, or 200 `{ ok: false, planLimit: "apps" }`.
- New errors: a `chatId` that isn't the caller's, or a `botId` that isn't in that chat, is 404 `not_found` ("Chat not found"). `questionId` or `botId` without `chatId` is 400 `invalid_request`.

`POST /api/v1/apps/connections/complete`

- Body unchanged: `{ state, status, accountId }`.
- Response gains `woke` and `inputSeq`: `{ connected: boolean, woke?: boolean, inputSeq?: number }`.
- A retried completion of an attempt that already completed (for example after a lost response) returns the same stored result, without waking the bot again.
  - `woke` is present only when the attempt had a `chatId`.
  - `woke: true` means the bot was woken with `connect_<state>`.
  - `woke: false` means the connection was saved but the bot couldn't be reached. The app should send "I've connected it" as the question's answer.
  - `inputSeq` (with `woke: true`, when Trigger.dev reports it) is the session input seq of the `connect_` message. To show the woken turn in an open chat, resume the chat stream from that seq (the web sets the transport session's `activeInputSeq` to it before `resumeStream()`), so the previous turn's end isn't mistaken for this one.

The web's `connectApp` server action takes the same optional `{ chatId, questionId, botId }`, kept in its state cookie.

### Phase 2: shared computer

`POST /api/v1/chats/:chatId/desktop`

- Works for group chats too: the account's one computer is shown in any of the person's chats.
- Response gains `inUseBy`: `{ missing: false, url, expiresAt, inUseBy: { botId: string, name: string } | null }`.
  - `inUseBy` is the bot whose turn holds the computer, or null.
  - `{ missing: true }` is unchanged.
- **The socket URL shape is unchanged** (`wss://<host>/api/chats/<chatId>/desktop?ticket=…`), so the app's `isDesktopSocketUrl` check keeps passing.

`POST /api/v1/chats/:chatId/desktop/reset` and `/desktop/pause`: same bodies and responses, and they work in group chats. **Both now affect every bot**, because there's one computer per account. New builds should say so in the confirmation ("This resets the computer for all your bots").

`GET /api/v1/chats/:chatId/status` gains `inUseBy`: `{ state, runId?, inUseBy: { botId, name } | null }`.

Any desktop route, and account deletion, may return 409 `conflict` "The computer is busy with another operation. Try again shortly." while a long command runs on the shared computer (it was a 500 before). Retry after a moment.

### Phase 3: approvals

`GET /api/v1/approvals` and `GET /api/v1/approvals/:id`: each approval gains:

```ts
{
  kind: "app" | "computer" // always present; rows from before Phase 3 are "app"
  hostname: string | null // computer approvals only
  action: string | null // computer approvals: "submit" | "post" | "send" | "delete" | "buy"; treat others as generic
  alwaysAllowed: boolean // false: "Always allow" acts as a plain approval and saves nothing, so hide it
}
```

`GET /api/v1/approvals/:id` (and `GET /api/v1/activity` approvals, without the image) also carry `preview: string | null` on the detail route: a `data:image/png;base64,…` screenshot the server took when the bot asked, for computer approvals, and `command: string | null`: for a held shell command, the exact command that will run once. Show it verbatim before Accept.

For `kind: "computer"`:

- `toolkit` is `"computer"`, `toolSlug` is `"COMPUTER_<ACTION>"` (e.g. `COMPUTER_SUBMIT`), and `arguments` is `{ hostname, action }`.
- `summary` is the bot's one-sentence description, as for app approvals.

`PATCH /api/v1/approvals/:id` is unchanged. For a computer approval, and for a high-risk app action (sending, posting, paying, deleting, anything touching money, grades, rosters or access), `"always"` counts as `"approve"` and saves no rule, so old builds' "Always allow" button and notification action stay safe. New builds offer only **Accept** and **Decline** for `kind: "computer"`, and hide Always allow when `alwaysAllowed` is false.

Standing rules (server ready):

| Route                            | Body                  | Response                                                                          |
| -------------------------------- | --------------------- | --------------------------------------------------------------------------------- |
| `GET /api/v1/approvals/rules`    |                       | `{ rules: { botId, botName, toolSlug, accountId: string \| null, createdAt }[] }` |
| `DELETE /api/v1/approvals/rules` | `{ botId, toolSlug }` | `{ revoked: true }`; 404 `not_found` "Rule not found"                             |

Rules are bound to the connected account they were granted for; a rule with a null account (saved before this change) is never applied.

Push for a computer approval uses the existing `approval` category and `data.approvalId`.

### Phase 3: usage

`GET /api/v1/usage` is unchanged in shape. The free plan's `limits.sandbox` is `300` seconds, one-time, like the free AI allowance. App copy that says the free plan has no computer must change.

- Desktop routes work on the free plan while seconds remain, in any owned chat. With none left they return 429 `usage_limit` ("Your free computer time is used up. …").
- The desktop socket may close with code `4429` (reason `usage_limit`): the time ran out while viewing. Code `4410` (`session_ended`): the session was paused, rotated or replaced; fetch a new ticket to reconnect.
- E2B capacity errors return 503 `upstream` "Computers are busy right now. Try again in a few minutes."
- A free computer unused for 30 days is deleted with its files.

### Phase 4: workflows

A workflow is a saved, reusable task with typed inputs. It runs on demand from chat or on a schedule through a routine.

```ts
type Workflow = {
  id: string
  botId: string | null // the bot that runs it by default
  name: string // 1-80
  description: string | null // 0-300
  instructions: string // 1-8000, what the bot does, written by the bot after interviewing the person
  inputs: {
    key: string // /^[a-z][a-z0-9_]{0,39}$/
    label: string // 1-80
    description: string | null // 0-200
    kind: "text" | "number" | "date" | "url"
    required: boolean
  }[] // at most 10
  toolkits: string[] // apps it uses, for display
  lastRunAt: string | null
  createdAt: string
  updatedAt: string
}
```

| Route                            | Body                                                                          | Response                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `GET /api/v1/workflows`          |                                                                               | `{ workflows: Workflow[] }`                                                     |
| `POST /api/v1/workflows`         | `{ requestId, name, description?, instructions, inputs?, toolkits?, botId? }` | 201 `{ workflow }`; a retry with the same `requestId` returns the same workflow |
| `GET /api/v1/workflows/:id`      |                                                                               | `{ workflow }`                                                                  |
| `PATCH /api/v1/workflows/:id`    | any of `name, description, instructions, inputs, toolkits, botId`             | `{ workflow }`                                                                  |
| `DELETE /api/v1/workflows/:id`   |                                                                               | `{ deleted: true }`                                                             |
| `POST /api/v1/workflows/:id/run` | `{ requestId, inputs: Record<string, string>, chatId?, botId? }`              | 201 `{ chatId, messageId }`                                                     |

- `run` posts `workflow_<op>` into `chatId` if given (it must be the caller's, and `botId` must be a member), otherwise into the direct chat of `botId ?? workflow.botId`.
- The app opens `chatId` to watch the run.
- Free plan: 1 workflow; paid: 50.

Errors:

| Status | Code              | Message                                                 |
| ------ | ----------------- | ------------------------------------------------------- |
| 404    | `not_found`       | "Workflow not found", "Chat not found", "Bot not found" |
| 400    | `invalid_request` | a missing required input names the input                |

At the plan's workflow limit, `POST /api/v1/workflows` returns 200 `{ ok: false, planLimit: "workflows" }` as data, like `apps`, not an error.

Routines (`/api/v1/routines`):

- Create and update accept optional `workflowId: string | null` and `workflowInputs: Record<string, string> | null`.
- Responses gain the same two fields, null for plain routines.
- A routine with a workflow runs the workflow's instructions with those inputs.
- `prompt` is still required on create for old builds. New builds may send the workflow's name as `prompt`.

### Phase 4: app preferences (sensitive data)

`GET /api/v1/apps` items gain `proactive: boolean` and `work: boolean`, both per toolkit.

- `proactive` defaults to true. False keeps For you and other proactive reads away from the app.
- `work` defaults to false. True makes the bot confirm with the person before reading data from that app.

`PATCH /api/v1/apps/preferences` takes `{ toolkit: string, proactive?: boolean, work?: boolean }` and returns `{ toolkit, proactive, work }`.

### Phase 4: attachments

The owner chose (2026-10-16) to put files on the account computer, plus inline images under 5 MB for the model to look at directly. No new storage service.

**Files: upload, then send.** Spreadsheets, documents, PDFs, student work, images the bot should process with code:

`POST /api/v1/chats/:chatId/attachments`, `multipart/form-data` with one `file` field per request.

- **Limits:** 25 MB per file, 10 files per message. The name is kept for display and sanitized for the path.
- **Starts the computer:** uploading wakes the account computer and spends a few of its seconds. That's why it's a POST to a chat-scoped route; any owned chat, direct or group, works.
- **201:**

  ```ts
  {
    attachment: {
      id: string
      name: string // sanitized display name, e.g. "Q3 production.xlsx"
      mediaType: string // from the upload, e.g. "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      size: number // bytes
      path: string // "~/workspace/uploads/<chatId>/<id>-<sanitized name>" on the account computer
    }
  }
  ```

- **200 `{ ok: false, usageLimit: "sandbox" }`:** no computer seconds left. Same pattern as the create-bot result. Show the plan state and don't send the message with this file.
- **Errors:**

  | Status | Code                   | When                                                                                        |
  | ------ | ---------------------- | ------------------------------------------------------------------------------------------- |
  | 404    | `not_found`            | "Chat not found"                                                                            |
  | 400    | `invalid_request`      | no file, or more than one file                                                              |
  | 413    | `too_large` (new code) | "Files can be up to 25 MB."                                                                 |
  | 502    | `upstream`             | "Couldn't reach the computer. Computers are busy right now, so try again in a few minutes." |

Then send the chat message (through Trigger.dev, as today) with the uploaded attachments in its metadata:

```ts
metadata: {
  // existing keys (botId, questionId, mentions, displayPrompt), plus
  attachments?: { id: string; name: string; mediaType: string; size: number; path: string }[] // at most 10, exactly as returned
}
```

- The text part may be empty when the message has attachments.
- The agent ignores entries whose `path` isn't under `~/workspace/uploads/<this chatId>/`. It tells the model the path, name and type of the others, and the bot opens them on the computer.
- Files stay until the computer is reset, deleted with the account, or removed by the 30-day free-plan retention rule. A chat's old attachment chips can point at files that are gone, so render them as names, not links.

**Inline images: no upload.** A photo or screenshot the person wants the bot to look at:

- **Shape:** an AI SDK file part in the message itself, `{ type: "file", mediaType, url: "data:<mediaType>;base64,…", filename? }`.
- **Allowed:** `image/png`, `image/jpeg`, `image/webp`, `image/gif`. At most 5 MB decoded, 4 per message. Downscale before sending (longest side 1568 px) to keep the transcript and model cost small.
- **No computer:** these don't touch the computer, so they work with no computer seconds left.
- **Not allowed:** anything else, larger, or a non-data URL. The agent drops it and tells the bot it was dropped, so the bot can ask for an upload instead.
- **Cost:** the image is sent to the model with every later turn of this chat, and an image in context moves the chat to the vision model. The app should explain neither; it's shown in usage.

**Rendering.** User messages show attachment chips (name and size) from `metadata.attachments`, and thumbnails from inline image parts. Old builds ignore both. They show the message text, and an attachments-only message as an empty bubble.

**Copied by hand:** the limits above live in `lib/attachment-policy.ts`.

### Phase 3: connectors and routines (server ready)

Tool shapes (all additive):

- `findApps` app entries may carry `needsReconnect: true` (a connection existed but expired, was revoked or failed in this run; it can also sit on a `connected: true` entry whose account works but lacks a permission the bot needed). The output may carry `searched: string[]` (refined queries) and `message`.
- `executeAppTool` input gains optional `accountId`. Its output may be `status: "requires_input"` with `code: "ACCOUNT_CHOICE_REQUIRED" | "ACCOUNT_NOT_FOUND"` and `accounts: { accountId, label?, connectedAt? }[]`; `status: "failed"` with `code: "CONNECTION_EXPIRED" | "INSUFFICIENT_PERMISSIONS"`, `reconnect: { toolkit }` and the failing `accountId`; or `status: "unknown"` with `code: "OUTCOME_UNKNOWN"` (the bot verifies before any retry). `searchAppTools` may add `accountsToChoose`.
- Routine schedules: `once.at` also accepts a wall-clock time without an offset (`"2026-10-17T15:00"`), read in the routine's timezone; stored values always carry an offset. `lastStatus` gains `completed` and `blocked`; `lastRunAt` is when the run was due. Routine tool outputs gain `timezone`, `nextRunLocal`, `lastRunLocal` and `lastError`.

## How old builds degrade, in one place

| Feature                                                    | Current build                                                                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Connect card                                               | Plain question with "I've connected it" / "Use the computer instead" / "Not now". Connect from Apps, then tap "I've connected it". |
| Wake on connect                                            | Doesn't apply: old builds don't send `chatId`, so nothing wakes. The person answers the question.                                  |
| `findApps`, workflow tools, `requestComputerApproval` rows | Humanized generic rows. `requestComputerApproval` renders as an approval card, since its output matches `approval_required`.       |
| Busy computer                                              | Finished tool row, and the bot explains in text.                                                                                   |
| `inUseBy`                                                  | Ignored.                                                                                                                           |
| Shared reset and pause                                     | Old confirmation copy talks about "this bot's computer". The action resets the account computer.                                   |
| Desktop in group chats                                     | Old builds may hide the Desktop button in group chats. Nothing breaks.                                                             |
| Computer approvals                                         | A generic tool row in chat; push and the Activity screen decide it. "Always allow" acts as Accept.                                 |
| Held computer steps                                        | The tool row shows the error text ("Approval required: …").                                                                        |
| Routine `completed` / `blocked`, `nextRunLocal`            | Unknown status drops the "Last run" suffix; extra fields ignored.                                                                  |
| Account choice, `CONNECTION_EXPIRED`                       | Tool rows only; the bot explains in text.                                                                                          |
| `computerLogin.reason`                                     | Stripped. The sign-in card opens Desktop for every reason.                                                                         |
| Free computer allowance                                    | Old copy may say the free plan has no computer. Usage numbers are correct.                                                         |
| Workflows                                                  | Not visible in the app. They still run on schedule through routines and from chat in any build.                                    |
| App preferences                                            | Not editable from the app. The server applies whatever the web set.                                                                |

## Copied by hand into the mobile app

When these change, the mobile app needs the matching change. The table lists only what this work changes.

| Source here                                          | What changes           | Phase   |
| ---------------------------------------------------- | ---------------------- | ------- |
| `lib/bot-setup-tools.ts` `computerLoginSchema`       | adds `reason`          | 3       |
| `lib/bot-setup-tools.ts` `appConnectionCardSchema`   | adds `reconnect`       | 3       |
| `db/schema.ts` `routines.lastStatus`                 | `completed`, `blocked` | 3       |
| `lib/bot-setup-tools.ts` `appConnectionSchema` (new) | new card               | 1       |
| `lib/billing-policy.ts` `planLimits.free.sandbox`    | 0 to 300               | 3       |
| `db/schema.ts` workflow form limits                  | new                    | 4       |
| `lib/api-response.ts` error messages                 | "Workflow not found"   | 4       |
| `lib/attachment-policy.ts` limits and image types    | new                    | 4       |
| `components/chat-tool-call.tsx` tool titles          | the five tools above   | 1, 3, 4 |
