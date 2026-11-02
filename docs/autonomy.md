# Autonomy: routines, approvals, activity

How a Krafty bot works when nobody is talking to it, and how it stays safe while doing so. Written 2026-10-16 with the first version. Where this disagrees with the code, the code wins.

## The loop

1. **Something starts a turn without the composer.** A routine comes due, the owner approves a held action, a teammate delegates, or a For you task starts. Each posts a user-role message into a chat from the server.
2. **The bot works unattended.** It's the ordinary chat agent (`trigger/chat.ts`) with the ordinary tools, ownership checks, allowance checks and metering. The message tells it nobody is watching.
3. **Risky actions wait.** Any connected-app write is held as an approval, and the turn stops.
4. **The owner hears about it on whatever device they have.** An activity event is recorded and a push goes to their phones: the work finished, the bot has a question, an approval is waiting, or a routine was skipped.
5. **One tap continues the work.** Approving, from the chat card, the Activity page or a notification action, runs exactly the app call the owner saw right away, then wakes the bot with the result. A computer step is run by the bot, which needs the screen.

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

### Continuation turns

A turn that stops at its step cap (`TURN_STEP_LIMIT`, 150 steps) or time cap (`TURN_TIME_LIMIT_MS`, 40 minutes, inside the task's one-hour `maxDuration`) while the bot still wanted another step carries on in a new turn (`lib/turn-continuation.ts`).

- `onTurnComplete` decides with `shouldContinueTurn`. A turn that failed, was stopped, asked a question, delegated, is waiting on an approval, ran out of allowance (AI, or computer time when it used the computer) or found the computer busy doesn't continue. A chain is at most `MAX_TURN_CONTINUATIONS` (10) turns, or `MAX_FREE_TURN_CONTINUATIONS` (2) on the free plan.
- The `continue-turn` task (`trigger/continuation.ts`) posts the message with `postChatMessage`, a few seconds later and only after the chat's run has exited: an append that arrives while a run is alive doesn't boot the next one. It drops the continuation when another run has started meanwhile, because the person's own message comes first.
- The message ID is `continue_<depth>_<root>`, where the root is the message that started the task. `unattendedOrigin`, `parseRoutineRunMessageId`, the declined-approval lookup and the delegation depth all read the root, so a continued routine is still unattended, its outcome lands on the routine run that started it, and a continued brief can't delegate deeper than its depth allows.
- A routine's outcome and the unattended report are written when the chain ends, not at each cut-off. A chain counts as a long turn for the "finished" activity.
- The chat shows the message as "Continuing".

## Routines

- **Storage:** the `routines` table. `schedule` is `daily` (time and weekdays), `interval` (whole hours, at least one) or `once`, and is read in the routine's IANA `timezone`. `nextRunAt` is null when the routine is paused or finished.
- **Pure logic:** `lib/routine-policy.ts` covers next-run computation across DST, descriptions, limits, prompts, the owner's clock line (`routineClock`) and the missed-run rule (`planDueRun`). Tested in `tests/routine-policy.test.ts` and `tests/routine-schedule-rules.test.ts`.
- **Chat first:** bots get the owner's timezone and local time every turn, so "tomorrow afternoon" is resolved locally. A `once` time may be given without an offset and is read in the routine's timezone. Tool results carry `nextRunLocal`, and the bot confirms only what the tool returned.
- **Run status:** `lastStatus` is `started` when posted, then the run's own turn records `completed`, `blocked` (stopped for an approval or a question) or `failed` with `lastError` (`recordRoutineRunOutcome` from `onTurnComplete`). An approval stores the message that started its task (`approvals.originMessageId`), and the turn its decision wakes carries that task on (`approvalOrigin`), so a run blocked on an approval is completed, blocked again or failed by the turns that resume it. A run blocked on a question isn't followed yet: the person's answer starts a new task. An outcome for an older run never overwrites a newer one. A turn that dies before `onTurnComplete` (cancelled, crashed, out of memory or time) never reports, so `run-routines` closes it (`closeStoppedRoutineRuns`): a run still `started` three minutes after its post whose chat has no live run, or any run still `started` two hours after its post, becomes `failed` with "The run stopped before it finished." and one `routine_failed` event keyed `<messageId>:failed` (pushed unless the run is over a day old). If the turn did report (`turn:` activity) but its outcome write was lost, the status is taken from that report without a second notice. The computer lease such a turn held is released by `meter-sandboxes` within a minute (`releaseStoppedComputerLeases`), and the computer paused as a turn's end would have: always on the free plan, on low allowance otherwise.
- **Claiming:** the `run-routines` cron (`trigger/routines.ts`, every minute, concurrency 1) claims one due row at a time with `FOR UPDATE SKIP LOCKED` and sets the next `nextRunAt` from now in the same transaction. It then dispatches outside the transaction.
  - A run found late still runs inside a grace window (6 hours for `once`; 1 hour for `daily`, or 12 hours when its runs are two or more days apart, such as a weekly report; for `interval`, at most an hour or half the interval, or 12 hours from 48 hours up). Past it, the run is recorded as skipped ("Missed while Krafty was unavailable"), without a push, and the schedule moves on. Missed runs are never replayed.
  - A crash between the commit and the dispatch skips that one run.
- **Checks before a run:** the bot is still accessible on the owner's plan, and the AI allowance isn't spent (or the owner uses their ChatGPT plan). A failed check records `routine_skipped` and pushes the reason, and the bot isn't woken.
- **Environment:** the cron only runs in Trigger.dev's production environment. Local development shares production's database but uses the development key, so a dev worker would post people's routines into the wrong environment. Set `KRAFTY_DEV_ROUTINES=1` for the dev worker to test.
- **Limits:** free 1, paid 50 per account (`ROUTINE_LIMITS`).
- **Prompt injection:** the routine tools refuse to create, change or delete routines during an unattended turn, since those turns read untrusted email and web content, and a bot can only change its own routines.
- **Cadence:** the next run is computed from when the routine was due, not when the cron ran, so intervals don't drift.
- **Event routines:** a schedule of kind `event` names one of the Composio triggers in `ROUTINE_EVENTS` (`lib/routine-events.ts`: new Gmail or Outlook mail, a Slack DM or channel message, a calendar event created or about to start). Creating the routine creates the trigger on the person's connected account (`routineTriggers` in `lib/composio.ts`; with several accounts the bot must name one), and the routine is deleted again if that fails. The trigger's ID is stored on the routine (`triggerId`, never sent to clients). Pausing and resuming switch the trigger, deleting removes it, and what starts a routine can't be changed (`EVENT_ROUTINE_CHANGE_ERROR`). Composio delivers to `/api/webhooks/composio`, which checks the signature with `COMPOSIO_WEBHOOK_SECRET` (and refuses everything without it), ignores anything but those triggers, and calls `dispatchRoutineEvent`: the routine must match the trigger, account, user and connected account; each webhook ID starts one run (`routine_events`); and a routine runs at most `EVENT_RUNS_PER_DAY` (20) times in 24 hours, with one notice when it stops. A trigger with no routine left is removed. The run's message carries what the app sent inside `<event>`, framed as someone else's data. Gmail triggers always add `-from:me` and Slack channel triggers `is_bot_message: false`, so a routine can't set itself off. Event routines have no `nextRunAt`; the cron never claims them. The mobile app shows them by `description`, with "No more runs scheduled" until it learns the kind.
- **Run history:** every run has a `routine_runs` row keyed by its message ID, written wherever the routine's `lastStatus` is (start, skip, missed, failed start, outcome, `closeStoppedRoutineRuns`), with the same conditions, so a retry never reopens a finished run. Unlike `lastStatus`, an outcome always lands on its own run, even after a newer run started. `spent` adds each turn of the run's task (net of credits) once per turn key (`addRoutineRunSpend` from `onTurnComplete`). The Activity page shows the last five per routine; `GET /api/v1/routines` returns them as `recentRuns`, and `GET /api/v1/routines/:id/runs` up to 50.
- **Context:** a routine posts into the same chat every run, so replaying the whole chat made each run cost more than the last. Every turn of a run's task (the run, its continuations and the turns its approvals wake) sends the model only the run itself, from its `Scheduled routine "…"` message, plus the reply just before it as context (`routineRunHistory` in `lib/routine-history.ts`). The transcript is untouched, and the person's next own message sees the whole chat. Routine runs get no follow-up suggestions; nobody is watching to tap one.
- **Where to create them:** the bot's `scheduleRoutine` tool (it reports into the current chat), the Activity page, or `POST /api/v1/routines` (it reports into the bot's latest direct chat).

## Approvals

- **What is held:** in `executeAppTool`, after schema validation, the gate asks `appToolRisk(slug, tags)` (`lib/approval-policy.ts`):
  - Composio's tags win when present (fetched once per slug per worker): `destructiveHint`, `updateHint` or `createHint` make it a write, otherwise `readOnlyHint` makes it a read. Until 2026-11-01 only `destructiveHint` counted, so `GOOGLESHEETS_FIND_REPLACE` (tagged `updateHint`, first verb FIND) and Google Calendar's `CALENDAR_LIST_PATCH`/`_UPDATE`/`_INSERT`/`_WATCH` ran as reads without a card;
  - otherwise the first verb in the slug decides, except that find-and-replace (`FIND_REPLACE`, `SEARCH_AND_REPLACE`) is always a write and always high-risk: one call rewrites every match, and an empty replacement clears them;
  - an unrecognised action counts as a write.
  - A per-bot "Always allow" rule (`approval_rules`) skips the gate for that slug.
- **On hold:** the call (slug, account, arguments, the bot's one-line summary) is stored in `approvals` with a 7-day expiry, and the owner gets a push in the `approval` category. The tool returns `approval_required`. A computer approval stops the turn at once. App approvals don't: the bot prepares a task's writes together (one email per client), up to `MAX_HELD_APPROVALS_PER_TURN` (10), then stops.
- **Batches:** app approvals from one reply share `approvals.batchId` (the turn's `<runId>-<turn>`). Each individual approval or decline wakes the bot immediately to confirm that action's actual outcome, even while other cards are pending. Undecided requests stay pending. Cards show "Approve all" and "Decline all" while two or more are waiting (`decideApprovalBatch`, `PATCH /api/v1/approvals/batches/:batchId`); a bulk decision runs each stored call once and sends one combined confirmation for the requests it actually decided. Atomic decisions prevent double taps and concurrent clients from executing the same action twice. Decline wakes still read the batch's declines from the database (`declinedFor`).
- **Decision:** `decideApproval` moves `pending` to `approved` or `denied` atomically, so a double tap from the phone and the web gets a 409 for the second. It then posts `approval_<id>_<decision>` into the chat.
- **Confirmations:** decision and email Send/Discard responses include the posted input cursor (`inputSeq`) when available. Web chat and the matching mobile client queue stream resumes from those cursors, including decisions made while another reply is streaming, so the person sees the AI's confirmation without refreshing. A committed input cursor settles all decisions consumed in the same turn. Email confirmations use the final saved recipients and subject after the owner's edits. Every bot is instructed to follow consequential tool outcomes with a short confirmation, distinguishing sent from drafted, approved from executed, declined from failed, and verified from unknown; pending cards and ambiguous outcomes never authorize another write. A routine stays blocked while other requests from that run await approval, even after an individual confirmation finishes. If dispatch fails, the decision and execution still stand, `woke` is false, and the UI explains that the bot wasn't reached.
- **Read-back:** a provider's success says the call was accepted, not what the record now holds. Every wake after an approved write (`approvalDecisionPrompt`, `approvalExecutedPrompt`, `batchDecisionPrompt`) tells the bot to read the change back once (`READ_BACK_INSTRUCTION`) and to report a missing or doubled change instead of running the write again. On the gateway model, approved sheet edits were reported as done from the provider's result alone until this was added (`scripts/verify-pulse-agent.ts --scenario approved`).
- **Tracker edits:** `reviewTracker` resolves a tab by metadata and reads an explicit bounded range. Stale or ambiguous column mappings expose no task rows or writable addresses until confirmed. Value edits are prepared together through `GOOGLESHEETS_UPDATE_VALUES_BATCH` with RAW values and ISO dates; the stored approval includes server-derived tab ID, headers, full target rows and expected values. Both decision-time and agent execution serialize Krafty writers by spreadsheet, recheck those preconditions immediately before the single update, and read back changed and preserved cells plus the provider's returned target ranges. Changed or unverifiable preconditions run nothing; unverifiable write outcomes never retry automatically. Older pending value-edit approvals without preconditions require a fresh review and approval. Google's values API has no compare-and-swap: a human editor can still race the final read and write. `scripts/verify-pulse-sheets.ts` probes real batch-get behavior only on an explicitly designated test account and sample sheet; `scripts/verify-pulse-agent.ts` asserts model workflows against simulated Sheets execution.

- **Execution:** approving an app action runs it from the decision itself (`runApprovedCall` in `lib/composio.ts`, passed to `decideApproval` by `services/approvals.ts`), so it never depends on the bot remembering to. On 2026-10-26 a routine's approved email sat `approved` because the woken bot finished without calling `runApprovedAction`. The wake message then says Krafty already ran it, with the provider's result (`approvalExecutedPrompt`), and the decision returns `executed` or `failed`. If running it from the decision throws, the claim is left for the bot, which calls `runApprovedAction({ approvalId })` as before. Either way `claimApproval` moves `approved` to `running` once, only for the same owner and bot, and returns the stored call; every path after the claim records `executed` or `failed` (`runClaimedCall`), so a row left `running` means the outcome was never confirmed. The model's own arguments are never used. If the connected account changed since approval, nothing runs.
- **Mail to the owner:** a plain-text direct send (`*_SEND_EMAIL`/`*_SEND_MAIL`, not a thread reply, no HTML or attachments) whose every recipient is an address verified on the owner's Krafty account (Clerk, `lib/owner-email.ts`) runs without a card (`selfAddressedEmail`, `ApprovalGate.sendsToOwner`), at most `SELF_EMAILS_PER_TURN` (3) per turn; more wait for approval. A bot asked for a card (`prepareOnly`) still gets one. Bots are told the owner's addresses in their instructions. When Clerk can't be reached, no address counts and every send waits as before.
- **Standing rules ("Always allow"):** bound to the bot, the action (`toolSlug`) and the connected account it was granted for (`approval_rules.accountId`). A rule never covers a high-risk action (`appToolHighRisk`: sending, posting, sharing, paying, deleting, anything touching money, grades, rosters or access, an unrecognised action, or Composio's `destructiveHint`); on those, and on every computer approval, "Always allow" counts as a plain approval and saves nothing (`alwaysAllowed: false` on the approval tells apps to hide the button). Rules saved before account binding have a null account and are never applied. The owner lists and removes rules on the Activity page or with `GET` and `DELETE /api/v1/approvals/rules`.
- **Declines stick:** a declined app call asked again unchanged within 24 hours is refused without a new card. The turn the owner's decline wakes looks up what was declined in the database (never from the message ID alone) and refuses every new approval request in that turn, app or computer.
- **Claims are bound:** an app approval is claimed only by its bot, from the chat it was asked in, within the approval's lifetime. A computer approval can never be spent through `runApprovedAction`, nor an app approval on the computer.

## Computer approvals

Every gesture on the account computer that could commit something outside it is checked by the server before it runs (`lib/computer-approval-policy.ts`, `lib/computer-approval-tools.ts`, `lib/computer-guard.ts`), whatever the bot says about it.

- **What is checked:** every `mouseClick` and `mouseDrag`; every `keyboardPress` except caret and focus keys (arrows, Home, End, Page Up/Down, Escape, Tab, Backspace) and the Ctrl/Cmd chords for select all, copy, paste, cut, undo, find, address bar, new and close tab; and `keyboardType` text that contains Enter or looks like a one-time code. Key names must be plain keysyms (`/^[A-Za-z0-9_]{1,32}$/`), because they reach `xdotool` on the computer's shell. Moving the pointer, scrolling, screenshots and file reads aren't checked.
- **The guard:** inside the computer's lock, the server takes its own screenshot and the active window's title and asks the app's vision model, with structured output, what the gesture would activate. The guard never sees the chat or the bot's words, treats on-screen text as untrusted, and reports injection attempts. `guardVerdict` decides: high impact, an injection attempt, or a low-confidence consequential category commits. A retried step on an unchanged screen reuses the verdict for 30 seconds.
- **Fail closed:** if the guard errors or times out, the gesture doesn't run. After three failures in a row, or when the turn has spent its guard budget (10 cents) or the account's AI allowance is nearly gone, committing gestures stop for the rest of the turn. Guard calls are app-funded on every plan, ChatGPT included, and recorded against the Krafty allowance under `ai:<runId>:<turn>:guard:<toolCallId>`, like web search.
- **Approval:** a committing gesture without an approval fails with a message that tells the bot to call `requestComputerApproval({ action, summary, hostname, command? })`. It holds only a step the gate refused in this turn, as the server classified it: a gesture is stored with the guard's action (`actionForCategory`) and, when the guard read the address bar, the guard's hostname, whatever label the bot passes, so the card shows the stricter kind (a "Submit order" button the guard sees as a purchase is approved as Buy) and the approval can be spent on that step (#33); `command` counts only when the shell refused that exact command this turn, with the shell's action, and is dropped from a gesture request. It needs a `viewScreen` in the turn, stores the server's screenshot (when it can be taken, up to about 1 MB) as the approval's `preview` for the owner to inspect, shows a held shell command verbatim on the card, caps a chat at three held computer steps, notifies like an app approval and stops the turn. Accepting wakes the bot, which looks again and repeats the step with `approvalId`. The gate's own refusals (held, not approved, declined, guard unavailable) are shown on the tool card as written (`computerRefusalMessage`); other errors stay generic.
- **Spending:** `spendComputerApproval` is atomic. The first spend needs the approval to be approved within the last hour, by the same owner, bot and chat; from then on it covers at most three checked gestures within 90 seconds (a delete and its confirmation). Each gesture must still pass the guard, and the guard's category must match the approved action (`approvalCovers`); when the guard reads a hostname from the address bar, it must match the approved site. When the guard can't see an address bar, the window title must name the approved site. Text typed with more than one Enter is refused on a committing step. Changing account security (passwords, permissions, ownership) and typing commands into a terminal window are never approvable: the bot asks the person to do those themselves. Every outcome is appended to `result`.
- **The shell:** `shellCommandRisk` reads the command line, with quotes and backslashes removed. It refuses command lines that drive the desktop (`xdotool`, `pyautogui`, `DISPLAY=`), take over the browser (remote debugging, CDP), touch the browser's profile, or schedule work for later (`crontab`, `nohup`, `tmux`, `systemctl`, start-up files). The file tools refuse the same paths. Obvious external writes (`curl` with data or a write method, `git push`, `gh`, `ssh`/`scp`/`rsync`/`nc`, mail tools, package publishing, cloud CLIs, `requests.post`) need an approval naming the exact command, with its data inline rather than in a file or piped input; that command runs once under it.

### The shell user and reading the screen

Computers are created from the `krafty-desktop` E2B template (`COMPUTER_TEMPLATE` in `lib/computer-shell.ts`, built by `scripts/build-e2b-template.ts`).

- **Shell user.** `bash`, `readFile`, `writeFile` and `listFiles` run as `worker`, in `/home/worker`. The desktop, Firefox and its sign-ins belong to `user`. Firefox saves downloads to `/home/worker/Downloads`, and `user` can read `worker`'s files, so the browser can upload what a bot made.
- **Hardening.** `computerShell` (`lib/e2b.ts`) hardens each computer as root before its first use in a process, and fails closed: a computer that can't be hardened runs no shell, and a new one isn't handed out.
  - The display starts without `-ac` (`AccountDesktop`), and `xhost` admits only `SI:localuser:user`. `xhost -local:` drops the hidden every-local-user entry.
  - nftables rejects `worker`'s TCP to the computer's own sshd, rpcbind, x11vnc, noVNC and envd (IPv4 and IPv6) and to the metadata service. Its other local ports and the internet stay open.
  - `/home/user` is `700`, root's and `user`'s passwords are locked, and `/usr/local` is no longer writable by everyone.
  - These steps run at first use, not in the template, because E2B's own config step runs after the template's steps and resets them.
  - `scripts/verify-screen-reader.ts` checks each of these from the shell user on a real computer.
- **Older computers.** A computer made before the template has no `worker`. Its shell runs as `user`, as before, until the person resets their computer.
- **readScreen.** It reads the focused window through the desktop's accessibility bus (AT-SPI). The walker runs as `user`, sent inline with the command. Firefox starts with `GNOME_ACCESSIBILITY=1` (a wrapper from the template). Text inside a web page is read whole; a control scrolled out of view is listed without a ref.
- **clickElement and fillElement.** They turn a ref into the element's position on screen and run the same checked gestures as `mouseClick` and `keyboardType`. The element's role and name are page content and never decide whether a step runs.
- **openOnScreen.** It opens an http or https address with `x-www-browser` as `user`, unchecked, like typing an address and pressing Enter.

### ESPN start/sit permission

Fantasy Coach has an owner-saved choice between manual approval and automatic
start/sit moves. This is a narrow exception to per-gesture computer approval,
not an Always allow rule for arbitrary computer submissions. The independent
guard still checks every committing gesture. Automatic permission requires a
high-confidence lineup-only verdict, no injection, an exact ESPN team URL with
the saved league/team/season, and a fresh enabled owner grant. Other teams,
trades, waivers, adds/drops and uncertain actions still require approval.
Pausing checks or their routine, deleting that routine, saving manual mode, or
deleting the bot disables the grant. See [fantasy-football.md](fantasy-football.md)
for setup, the daily schedule and the classifier's practical limits.

### What is enforced, and what isn't

Enforced by the server: app writes run only from the stored call; high-risk app actions never get a standing rule; standing rules are bound to bot, account and action, and revocable; every click, drag, Enter and non-navigation key on the computer is judged by a separate model from a screenshot the server takes, and high-impact gestures run only inside a claimed, time-boxed approval for that bot and chat; the guard fails closed; account-security changes and desktop terminal commands are never approvable; a held shell command runs once, exactly as the owner saw it; a decline blocks every new approval request for the rest of the turn it wakes, and an app call declined unchanged is refused for a day; on computers from the template, shell commands and file tools run as a user that can't reach the display, the browser profile, the accessibility bus or the desktop's local services. Nothing in a web page, document or tool result can grant an approval; only the owner's decision in the database can.

Not enforced, only reduced:

- The guard is a model reading pixels. It can be wrong, or deceived by overlays, misleading labels or a confirmation it can't foresee, and a page can change between its screenshot and the gesture.
- Typing without Enter can still commit on some sites (an auto-submitting field, a space on a focused button).
- **On computers made before the template, the shell is not a boundary.** It runs as the same user as the browser, with the desktop's display. The command-line rules stop obvious commands only: a script written with `writeFile` or downloaded, string-built names (`'pyauto'+'gui'`), or an unlisted tool can make network writes, drive the screen or read cookies, and a page can try to talk the bot into that. Resetting the computer moves it to the template.
- **On computers from the template, the shell can still make network writes.** The command-line rules are its only check: a script written with `writeFile` or downloaded can post data, and a page can try to talk the bot into that. It can also leave files in its home or `~/Downloads` that the browser later uploads.
- A computer decline isn't remembered after its turn: the next message can lead the bot to ask again (the owner sees a new card; nothing runs without it). Delegated teammates and routines go through the same gates, and a decline in one chat doesn't stop another chat from asking.
- The guard's 15-second check runs inside the computer's lock, so a second call in the same step can time out waiting and must be retried.

## Activity and notifications

- **Activity:** `recordActivity` writes `activity_events` with a `dedupeKey`, so a retried task records and notifies once. The Activity page and `GET /api/v1/activity` show pending approvals, routines and the last 50 events.
- **Push:** `sendPush` sends to every Expo token in `push_devices` for the user, in batches of 100, and deletes tokens Expo reports as `DeviceNotRegistered`. It never throws. The payload `data.path` is an in-app path from the mobile deep-link allowlist, `data.approvalId` is set for approvals, and `categoryId: "approval"` gives the notification its Approve, Always allow and Decline buttons.
- **When a turn notifies (`reportUnattendedTurn` in `trigger/chat.ts`):**
  - any turn with an unattended origin;
  - any turn that took two minutes or more;
  - questions take precedence over "finished";
  - a turn that requested an approval has already notified;
  - a turn stopped at the bot's spend limit or for repeating itself says so ("stopped at its spend limit", "stopped repeating itself").
- **Morning summary (`lib/morning-summary.ts`, the hourly `morning-summaries` task in `trigger/morning-summary.ts`):** one push at `user_settings.digestHour` (8 by default) in the person's timezone, counting what finished, what didn't, questions, and approvals still waiting since the last summary (at most the last day). Skipped when nothing happened, when `morningSummary` is off (Activity page, `PUT /api/v1/activity/summary`), when the timezone is still the `UTC` default, and for people without a phone. `lastSummaryAt` is claimed before sending, so a retry never sends twice. Like `run-routines`, it runs only in production unless `KRAFTY_DEV_ROUTINES=1`.

## Spending while unattended

- Each step's model cost is written to `usage_holds` under the turn's ledger key (`ai:${runId}:${turn}`), and `getUsage` counts holds.
  - Parallel turns on one account (routines, delegations, open chats) see each other's spend and stop together when the account runs out.
  - Free-plan turns no longer hold an account lock while the model streams.
- `recordUsage` releases the hold in the same transaction that writes the entry.
- A turn that dies before `onTurnComplete` leaves its hold. `run-routines` books holds untouched for two hours, so the spend is still billed.

## Spend per reply (`lib/turn-spend.ts`)

- **What a reply spent** is its model steps (zero on the person's ChatGPT plan), web searches, teammate consultations, computer-guard checks and follow-up suggestions. `onBeforeTurnComplete` writes it to the reply as a `data-turnUsage` part, which the web chat shows under the reply. Computer seconds are metered per computer, not per reply, and aren't included.
- **Failures are given back.** Trigger.dev reports a model that failed partway as a missing or `"error"` finish reason, not as an `error` (`turnFailed`). Such a turn, or one that threw, gets a negative `usage_entries` row under `<turn key>:credit` for everything it spent. Stopped turns and allowance refusals aren't failures. A turn that threw skips `onBeforeTurnComplete`, so `onTurnComplete` records its credit and the reply can't show it. A run that dies before `onTurnComplete` gets no credit; its hold is booked as above.
- **Loops stop.** A reply whose last `LOOP_STEP_LIMIT` (6) steps made the same tool calls with the same inputs and got the same results stops (`repeatedSteps`), doesn't continue, and gets back what every repeat after the first spent. Bots are told to wait inside one step instead of repeating a check.
- **Limit per task.** `bots.taskBudget` (5¢, 25¢, $1 or $5, or none) caps what one task spends, counting the continuation turns before it (`priorTaskSpend` adds their `data-turnUsage` parts from the transcript). The limit of the bot the turn started with applies, even after a handoff. It's checked after each step, so the step that crosses it finishes. The turn doesn't continue; a routine run that hits it is `blocked`.
- The ledger keeps both rows, the spend and the credit, so the billing record shows what happened.

## Known tradeoffs

- A push token belongs to whichever account registered it last, so someone who knows another person's Expo token could redirect that phone's notifications to their own account. Expo tokens aren't exposed anywhere in Krafty. Binding tokens to an install ID would close this.

## Not built yet

- Event triggers beyond the six in `ROUTINE_EVENTS` (GitHub, webhooks of the person's own), and an event option in the web and app routine forms (event routines are made in chat today).
- Moving computers made before the `krafty-desktop` template to it without a reset.
- Undo for app writes.
- Approval from a lock-screen action without opening the app (today the action opens the app, which calls the API with the session).
