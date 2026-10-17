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
- **Pure logic:** `lib/routine-policy.ts` covers next-run computation across DST, descriptions, limits, prompts, the owner's clock line (`routineClock`) and the missed-run rule (`planDueRun`). Tested in `tests/routine-policy.test.ts` and `tests/routine-schedule-rules.test.ts`.
- **Chat first:** bots get the owner's timezone and local time every turn, so "tomorrow afternoon" is resolved locally. A `once` time may be given without an offset and is read in the routine's timezone. Tool results carry `nextRunLocal`, and the bot confirms only what the tool returned.
- **Run status:** `lastStatus` is `started` when posted, then the run's own turn records `completed`, `blocked` (stopped for an approval or a question) or `failed` with `lastError` (`recordRoutineRunOutcome` from `onTurnComplete`). An outcome for an older run never overwrites a newer one.
- **Claiming:** the `run-routines` cron (`trigger/routines.ts`, every minute, concurrency 1) claims one due row at a time with `FOR UPDATE SKIP LOCKED` and sets the next `nextRunAt` from now in the same transaction. It then dispatches outside the transaction.
  - A run found late still runs inside a grace window (6 hours for `once`, 1 hour for `daily`, at most an hour or half the interval for `interval`). Past it, the run is recorded as skipped ("Missed while Krafty was unavailable"), without a push, and the schedule moves on. Missed runs are never replayed.
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
- **Standing rules ("Always allow"):** bound to the bot, the action (`toolSlug`) and the connected account it was granted for (`approval_rules.accountId`). A rule never covers a high-risk action (`appToolHighRisk`: sending, posting, sharing, paying, deleting, anything touching money, grades, rosters or access, an unrecognised action, or Composio's `destructiveHint`); on those, and on every computer approval, "Always allow" counts as a plain approval and saves nothing (`alwaysAllowed: false` on the approval tells apps to hide the button). Rules saved before account binding have a null account and are never applied. The owner lists and removes rules on the Activity page or with `GET` and `DELETE /api/v1/approvals/rules`.
- **Declines stick:** a declined app call asked again unchanged within 24 hours is refused without a new card. The turn the owner's decline wakes looks up what was declined in the database (never from the message ID alone) and refuses every new approval request in that turn, app or computer.
- **Claims are bound:** an app approval is claimed only by its bot, from the chat it was asked in, within the approval's lifetime. A computer approval can never be spent through `runApprovedAction`, nor an app approval on the computer.

## Computer approvals

Every gesture on the account computer that could commit something outside it is checked by the server before it runs (`lib/computer-approval-policy.ts`, `lib/computer-approval-tools.ts`, `lib/computer-guard.ts`), whatever the bot says about it.

- **What is checked:** every `mouseClick` and `mouseDrag`; every `keyboardPress` except caret and focus keys (arrows, Home, End, Page Up/Down, Escape, Tab, Backspace) and the Ctrl/Cmd chords for select all, copy, paste, cut, undo, find, address bar, new and close tab; and `keyboardType` text that contains Enter or looks like a one-time code. Key names must be plain keysyms (`/^[A-Za-z0-9_]{1,32}$/`), because they reach `xdotool` on the computer's shell. Moving the pointer, scrolling, screenshots and file reads aren't checked.
- **The guard:** inside the computer's lock, the server takes its own screenshot and the active window's title and asks the app's vision model, with structured output, what the gesture would activate. The guard never sees the chat or the bot's words, treats on-screen text as untrusted, and reports injection attempts. `guardVerdict` decides: high impact, an injection attempt, or a low-confidence consequential category commits. A retried step on an unchanged screen reuses the verdict for 30 seconds.
- **Fail closed:** if the guard errors or times out, the gesture doesn't run. After three failures in a row, or when the turn has spent its guard budget (10 cents) or the account's AI allowance is nearly gone, committing gestures stop for the rest of the turn. Guard calls are app-funded on every plan, ChatGPT included, and recorded against the Krafty allowance under `ai:<runId>:<turn>:guard:<toolCallId>`, like web search.
- **Approval:** a committing gesture without an approval fails with a message that tells the bot to call `requestComputerApproval({ action, summary, hostname, command? })`. That needs a `viewScreen` in the turn, stores the server's screenshot (when it can be taken, up to about 1 MB) as the approval's `preview` for the owner to inspect, shows a held shell command verbatim on the card, caps a chat at three held computer steps, notifies like an app approval and stops the turn. Accepting wakes the bot, which looks again and repeats the step with `approvalId`.
- **Spending:** `spendComputerApproval` is atomic. The first spend needs the approval to be approved within the last hour, by the same owner, bot and chat; from then on it covers at most three checked gestures within 90 seconds (a delete and its confirmation). Each gesture must still pass the guard, and the guard's category must match the approved action (`approvalCovers`); when the guard reads a hostname from the address bar, it must match the approved site. When the guard can't see an address bar, the window title must name the approved site. Text typed with more than one Enter is refused on a committing step. Changing account security (passwords, permissions, ownership) and typing commands into a terminal window are never approvable: the bot asks the person to do those themselves. Every outcome is appended to `result`.
- **The shell:** `shellCommandRisk` reads the command line, with quotes and backslashes removed. It refuses command lines that drive the desktop (`xdotool`, `pyautogui`, `DISPLAY=`), take over the browser (remote debugging, CDP), touch the browser's profile, or schedule work for later (`crontab`, `nohup`, `tmux`, `systemctl`, start-up files). The file tools refuse the same paths. Obvious external writes (`curl` with data or a write method, `git push`, `gh`, `ssh`/`scp`/`rsync`/`nc`, mail tools, package publishing, cloud CLIs, `requests.post`) need an approval naming the exact command, with its data inline rather than in a file or piped input; that command runs once under it.

### What is enforced, and what isn't

Enforced by the server: app writes run only from the stored call; high-risk app actions never get a standing rule; standing rules are bound to bot, account and action, and revocable; every click, drag, Enter and non-navigation key on the computer is judged by a separate model from a screenshot the server takes, and high-impact gestures run only inside a claimed, time-boxed approval for that bot and chat; the guard fails closed; account-security changes and desktop terminal commands are never approvable; a held shell command runs once, exactly as the owner saw it; a decline blocks every new approval request for the rest of the turn it wakes, and an app call declined unchanged is refused for a day. Nothing in a web page, document or tool result can grant an approval; only the owner's decision in the database can.

Not enforced, only reduced:

- The guard is a model reading pixels. It can be wrong, or deceived by overlays, misleading labels or a confirmation it can't foresee, and a page can change between its screenshot and the gesture.
- Typing without Enter can still commit on some sites (an auto-submitting field, a space on a focused button).
- **The shell is not a boundary.** It runs as the same user as the browser, with the desktop's display. The command-line rules stop obvious commands only: a script written with `writeFile` or downloaded, string-built names (`'pyauto'+'gui'`), or an unlisted tool can make network writes, drive the screen or read cookies, and a page can try to talk the bot into that. The real boundary is a separate Unix user for `bash` without the display or the browser profile, in a custom E2B template (follow-up).
- A computer decline isn't remembered after its turn: the next message can lead the bot to ask again (the owner sees a new card; nothing runs without it). Delegated teammates and routines go through the same gates, and a decline in one chat doesn't stop another chat from asking.
- The guard's 15-second check runs inside the computer's lock, so a second call in the same step can time out waiting and must be retried.

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
- A separate Unix user for shell commands on the computer, so scripts can't reach the desktop or the browser profile.
- Undo for app writes.
- Per-bot budgets.
- Approval from a lock-screen action without opening the app (today the action opens the app, which calls the API with the session).
