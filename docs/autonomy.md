# Autonomy: routines, approvals, activity

How a Krafty bot works when nobody is talking to it, and how it stays safe while doing so. Written 2026-10-16 with the first version. Where this disagrees with the code, the code wins.

## The loop

1. **Something starts a turn without the composer.** A routine comes due, the owner approves a held action, a teammate delegates, or a For you task starts. Each posts a user-role message into a chat from the server.
2. **The bot works unattended.** It's the ordinary chat agent (`trigger/chat.ts`) with the ordinary tools, ownership checks, allowance checks and metering. The message tells it nobody is watching.
3. **Risky actions wait.** Any connected-app write is held as an approval, and the turn stops.
4. **The owner hears about it on whatever device they have.** An activity event is recorded and a push goes to their phones: the work finished, the bot has a question, an approval is waiting, or a routine was skipped.
5. **One tap continues the work.** Approving, from the chat card, the Activity page or a notification action, wakes the bot, which runs exactly the call the owner saw.

## Server-sent turns

`postChatMessage(chatId, { id, text, displayPrompt }, { botId })` in `lib/chat-dispatch.ts`:

- calls `sessions.start` with a `preload` base payload, which creates the session if it doesn't exist and is a no-op when it does;
- appends the message to the session's input channel (`/realtime/v1/sessions/:id/in/append`), which wakes a run if none is alive;
- sends the message ID as `X-Part-Id`, Trigger.dev's idempotency key for appends, so a retry never posts twice.

Don't re-call `sessions.start` with `basePayload.message` for an existing session. Trigger.dev silently drops the message.

The message ID marks the turn's origin, and `unattendedOrigin` reads it in `onTurnComplete`:

| Prefix                       | Origin                                                                         | Written by               |
| ---------------------------- | ------------------------------------------------------------------------------ | ------------------------ |
| `routine_<id>_<scheduledAt>` | routine run                                                                    | `lib/routines.ts`        |
| `approval_<id>_<decision>`   | owner's decision                                                               | `lib/approvals.ts`       |
| `brief_<op>`                 | delegation                                                                     | `lib/team-delegation.ts` |
| `task_<op>`                  | For you task                                                                   | `services/for-you.ts`    |
| `connect_<state>`            | an app connected from a connect card (attended: `unattendedOrigin` ignores it) | `lib/connect-wake.ts`    |

`displayPrompt` metadata ("Routine: Morning brief", "Approved") is what the chat shows in place of the long instruction text.

## Routines

- **Storage:** the `routines` table. `schedule` is `daily` (time and weekdays), `interval` (whole hours, at least one) or `once`, and is read in the routine's IANA `timezone`. `nextRunAt` is null when the routine is paused or finished.
- **Pure logic:** `lib/routine-policy.ts` covers next-run computation across DST, descriptions, limits and prompts. Tested in `tests/routine-policy.test.ts`.
- **Claiming:** the `run-routines` cron (`trigger/routines.ts`, every minute, concurrency 1) claims one due row at a time with `FOR UPDATE SKIP LOCKED` and sets the next `nextRunAt` from now in the same transaction. It then dispatches outside the transaction.
  - Missed runs (worker downtime) aren't replayed.
  - A crash between the commit and the dispatch skips that one run.
- **Checks before a run:** the bot is still accessible on the owner's plan, and the AI allowance isn't spent (or the owner uses their ChatGPT plan). A failed check records `routine_skipped` and pushes the reason, and the bot isn't woken.
- **Environment:** the cron only runs in Trigger.dev's production environment. Local development shares production's database but uses the development key, so a dev worker would post people's routines into the wrong environment. Set `KRAFTY_DEV_ROUTINES=1` for the dev worker to test.
- **Limits:** free 1, paid 50 per account (`ROUTINE_LIMITS`).
- **Prompt injection:** the routine tools refuse to create, change or delete routines during an unattended turn, since those turns read untrusted email and web content, and a bot can only change its own routines.
- **Cadence:** the next run is computed from when the routine was due, not when the cron ran, so intervals don't drift.
- **Where to create them:** the bot's `scheduleRoutine` tool (it reports into the current chat), the Activity page, or `POST /api/v1/routines` (it reports into the bot's latest direct chat).

## Approvals

- **What is held:** in `executeAppTool`, after schema validation, the gate asks `appToolRisk(slug, tags)` (`lib/approval-policy.ts`):
  - Composio's `destructiveHint` and `readOnlyHint` tags win when present (fetched once per slug per worker);
  - otherwise the first verb in the slug decides;
  - an unrecognised action counts as a write.
  - A per-bot "Always allow" rule (`approval_rules`) skips the gate for that slug.
- **On hold:** the call (slug, account, arguments, the bot's one-line summary) is stored in `approvals` with a 7-day expiry. The tool returns `approval_required`, the turn's stop condition fires, and the owner gets a push in the `approval` category.
- **Decision:** `decideApproval` moves `pending` to `approved` or `denied` atomically, so a double tap from the phone and the web gets a 409 for the second. It then posts `approval_<id>_<decision>` into the chat.
- **Execution:** the bot calls `runApprovedAction({ approvalId })`. `claimApproval` moves `approved` to `running` once, only for the same owner and bot, and returns the stored call; every path after the claim records `executed` or `failed`, so a row left `running` means the outcome was never confirmed. The model's own arguments are never used. If the connected account changed since approval, nothing runs.
- **What isn't gated:** shell and browser actions on the account's computer, which all the person's bots share. The computer is isolated, but browser purchases and posts there are still only governed by instructions. This is the next gap to close (see the roadmap).

## Activity and notifications

- **Activity:** `recordActivity` writes `activity_events` with a `dedupeKey`, so a retried task records and notifies once. The Activity page and `GET /api/v1/activity` show pending approvals, routines and the last 50 events.
- **Push:** `sendPush` sends to every Expo token in `push_devices` for the user, in batches of 100, and deletes tokens Expo reports as `DeviceNotRegistered`. It never throws. The payload `data.path` is an in-app path from the mobile deep-link allowlist, `data.approvalId` is set for approvals, and `categoryId: "approval"` gives the notification its Approve, Always allow and Decline buttons.
- **When a turn notifies (`reportUnattendedTurn` in `trigger/chat.ts`):**
  - any turn with an unattended origin;
  - any turn that took two minutes or more;
  - questions take precedence over "finished";
  - a turn that requested an approval has already notified.

## Spending while unattended

- Each step's model cost is written to `usage_holds` under the turn's ledger key (`ai:${runId}:${turn}`), and `getUsage` counts holds.
  - Parallel turns on one account (routines, delegations, open chats) see each other's spend and stop together when the account runs out.
  - Free-plan turns no longer hold an account lock while the model streams.
- `recordUsage` releases the hold in the same transaction that writes the entry.
- A turn that dies before `onTurnComplete` leaves its hold. `run-routines` books holds untouched for two hours, so the spend is still billed.

## Known tradeoffs

- A push token belongs to whichever account registered it last, so someone who knows another person's Expo token could redirect that phone's notifications to their own account. Expo tokens aren't exposed anywhere in Krafty. Binding tokens to an install ID would close this.

## Not built yet

- Event triggers: new email, PR review requested, webhook.
- Gating for computer actions.
- Undo for app writes.
- Per-bot budgets.
- Approval from a lock-screen action without opening the app (today the action opens the app, which calls the API with the session).
