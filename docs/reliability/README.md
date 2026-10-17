# Reliability harness

How Krafty measures whether bots do real work end to end. The target for Dec 31 is 100+ representative runs, 95% success and zero duplicate external actions (#22). Every run is logged in [`runs.md`](runs.md), with its evidence in [`evidence/`](evidence/).

Tests passing doesn't count here. A run is a real turn of the real agent: the production (or development) Trigger.dev chat agent, real models, real Tavily, Composio and E2B, and the production database.

## How a run works

`scripts/reliability-run.ts` drives the scenarios. It's an opt-in live check like `scripts/verify-*.ts`, not part of `pnpm test`.

```sh
pnpm exec tsx --env-file=.env.local scripts/reliability-run.ts list
pnpm exec tsx --env-file=.env.local scripts/reliability-run.ts create routine-once
pnpm exec tsx --env-file=.env.local scripts/reliability-run.ts observe <tag> --wait
```

| Command                              | What it does                                                                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create <scenario>`                  | Makes a throwaway account, a bot (through `provisionTeammate`, as `createBot` does), its chat and a routine (through `createRoutine`), then applies the scenario's fixture |
| `rerun <tag> [prompt] [--new-chat]`  | Prod: schedules the routine again about a minute out, optionally into a new chat with the same bot                                                                         |
| `fire <tag> [--twice]`               | Dev: dispatches the routine now with `runRoutine`; `--twice` posts the same run twice                                                                                      |
| `say <tag> <text> [--question <id>]` | Dev: posts a message, optionally as the answer to an `askUser` question                                                                                                    |
| `decide <tag> approve\|deny`         | Dev: decides the pending approval with `decideApproval`, which wakes the bot                                                                                               |
| `observe <tag> [--wait]`             | Waits for the outcome, collects the evidence, checks the scenario and writes `.artifacts/reliability/runs/<tag>.json`                                                      |
| `stop <tag>`                         | Disables every routine of the account                                                                                                                                      |
| `close-computer <tag>`               | Deletes the account's E2B computer                                                                                                                                         |
| `accounts`                           | Lists the reliability accounts in the database                                                                                                                             |

### Environments

- **prod.** The script only writes the account's rows. The routine is left due, and the production `run-routines` cron claims it and posts it with the production key. The production chat agent then does the turn. Nothing local posts to production. This is the real unattended path, including the cron's claim, the plan and allowance checks, and `onTurnComplete`.
- **dev.** For flows that need a second message: approvals, setup answers, chat-created routines. Messages are posted with `.env.local`'s development key, so a local worker must be running (`npx trigger.dev@4.7.4 dev start --env-file .env.local --profile ai-teammates`, with `TRIGGER_PROJECT_REF` exported). It runs `main`'s code on the shared database. Dev routines are created disabled (no `nextRunAt`), so the production cron can never claim them. Never set `KRAFTY_DEV_ROUTINES=1` for this: the dev cron would claim real people's routines.

### Accounts

Every account is a synthetic user ID, `reliability-<date>-<scenario>-<hex>`. It doesn't exist in Clerk, so Clerk Billing answers 404 and the account is on the free plan (one bot, one routine, $1 AI and 5 computer minutes lifetime). The script refuses to touch any user ID without the prefix. No real person's data, inbox or account is read or written, and nothing sends email or messages.

Fixtures only set up states a real account reaches on its own, and never bypass a gate to make a check pass:

- `exhaust-ai` / `nearly-exhaust-ai`: a usage entry of $1.00 or $0.995 (`reliability:<tag>:fixture`), as if the allowance had been spent.
- `missed`: the one-off's schedule and `nextRunAt` moved 7 hours into the past, as if the worker had been down.
- `downgraded`: an older second bot added after the routine exists, as if a paid account with two bots had downgraded.

### What a run records

`observe` writes the routine row, activity events, every usage ledger key (turn keys `ai:<runId>:<turn>` give the Trigger.dev run IDs), approvals, memories, the chat's last reply, the computer's state and the Trigger.dev runs tagged `chat:<chatId>`. It then applies the scenario's pass criteria. Reply quality is judged by the operator from the reply and noted in `runs.md`.

### Duplicate external action check

Every run counts:

- `extraTurns`: turns beyond the messages the harness caused. A duplicate dispatch or replay shows here.
- `routineStartsOverOne`: `routine_started` events per scheduled run beyond one.
- `approvalsExecutedOverOne`: approvals executed beyond one per scenario.
- `duplicateMemories`: identical active memories.
- `unattendedRoutineCreates`: routines created beyond the one the harness made.

Any non-zero count is a duplicate and fails the run. For connected-app writes (blocked so far), the check also needs the provider's side: one sent message or one created record.

### Results

- **PASS**: every pass criterion met and zero duplicates.
- **FAIL**: a criterion missed. Each failure links a `bug` issue with repro and a proposed fix.
- **BLOCKED**: can't run safely without something from Drew. Not counted in the success rate.
- **VOID**: the harness was wrong, not the product (logged, explained, rerun, not counted).

Success rate = PASS / (PASS + FAIL).

### Spend and limits

Each run makes real model calls on the app's allowance, usually under half a cent. Web searches are $0.008 each. E2B stays on the Hobby plan: at most three short computer sessions per phase, and every computer is paused or deleted afterwards (`close-computer`). Routines left enabled are listed in `runs.md`. Stop them with `stop <tag>`.

## Scenario catalog

`Harness` names the scenario in `scripts/reliability-run.ts`. Scenarios marked blocked list what's missing in [`runs.md`](runs.md#blocked).

### Routines (#18)

| ID  | Scenario                                                    | Env      | Steps                                                                | Pass criteria                                                                                                                                | Duplicate check                 |
| --- | ----------------------------------------------------------- | -------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| R1  | One-off routine fires and reports (`routine-once`)          | prod     | Routine due in ~1 min. Prompt: reply with PONG, no tools.            | `lastStatus` completed, reply has PONG, `routine_started` + `work_finished` activity, one chat run                                           | One turn, one `routine_started` |
| R2  | Daily routine fires and advances (`routine-daily`)          | prod     | Every day at the next minute (America/New_York)                      | Completed. `nextRunAt` is the same local time the next day. The next day's firing runs too.                                                  | One turn per day                |
| R3  | Weekday 9am routine from chat (`routine-from-chat`)         | dev      | Ask the bot "every weekday at 9am…" in a chat. Answer its questions. | With no saved timezone the bot asks first. Routine `daily 09:00 [1-5]`, `America/New_York`, next run Monday 13:00Z, and the reply quotes it. | One routine                     |
| R4  | Near-term one-off from chat, seen in Activity               | prod web | Signed in: "remind me in 5 minutes…". Watch Activity.                | Local next-run shown. Fires. Activity shows completed, blocked and failed states.                                                            | One firing                      |
| R5  | Missed run is skipped, not replayed (`missed-run`)          | prod     | One-off due 7 h ago (past the 6 h grace window)                      | Skipped with "Missed while Krafty was unavailable", `:missed` activity, no chat run                                                          | Zero turns                      |
| R6  | Same run dispatched twice (`duplicate-dispatch`)            | dev      | `runRoutine` twice with the same `scheduledAt`                       | Completed, one turn, one `routine_started`                                                                                                   | One turn for two posts          |
| R7  | Unattended turn can't create routines (`routine-injection`) | prod     | Routine prompt asks for a new hourly routine                         | Bot refuses, routine count stays 1                                                                                                           | `unattendedRoutineCreates` = 0  |

### Agent loop, tools and memory (#15)

| ID  | Scenario                                                             | Env  | Steps                                            | Pass criteria                                                 | Duplicate check            |
| --- | -------------------------------------------------------------------- | ---- | ------------------------------------------------ | ------------------------------------------------------------- | -------------------------- |
| T1  | Web search with a source (`web-search`)                              | prod | Routine asks for a fact with its source          | Completed, one metered `:web:` key per search, a source named | One charge per search call |
| M1  | Memory saved once (`memory-save`)                                    | prod | Routine asks to remember a codename              | One active memory with the codename                           | `duplicateMemories` = 0    |
| M2  | Memory recalled in a new chat (`memory-recall` + `rerun --new-chat`) | prod | Save a codename, then ask for it from a new chat | The new chat's reply has the codename                         | No new memory written      |

### Onboarding (#13)

| ID  | Scenario                                                     | Env      | Steps                                                              | Pass criteria                                                                           | Duplicate check      |
| --- | ------------------------------------------------------------ | -------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | -------------------- |
| O1  | Setup greeting, questions, saved config (`setup-onboarding`) | dev      | `startBotSetupSession`, answer, then "Save it" on the confirmation | Greeting, confirmation question, then `setupComplete`, name, job and instructions saved | One greeting per bot |
| O2  | Web signup to pinned bot                                     | prod web | Sign up, open /workspace, create bot, setup, return and pin        | No dead ends, screenshots of each step                                                  | One bot per create   |

### Connected apps and approvals (#16)

| ID  | Scenario                                             | Env      | Steps                                                     | Pass criteria                                                                 | Duplicate check                            |
| --- | ---------------------------------------------------- | -------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------ |
| C1  | Unconnected app asks to connect (`disconnected-app`) | prod     | Routine asks for unread Gmail count, nothing connected    | `blocked` with a connect question, no approval, no tool executed              | No writes                                  |
| C2  | Connect from chat card, bot resumes                  | prod web | Test Gmail. Connect from the card.                        | Bot resumes on its own (`connect_` wake), read succeeds                       | One resume                                 |
| C3  | Write held, approved, lands once                     | prod web | Test Gmail. "Send a test email to <test inbox>". Approve. | Approval pending, then executed. Exactly one email in the test inbox.         | One sent message, approval `executed` once |
| C4  | Decline sticks                                       | prod web | Decline C3's approval                                     | Bot doesn't retry. Same call unchanged within 24 h is refused without a card. | Zero sends                                 |
| C5  | Custom-auth or API-key toolkit error shows           | prod web | Connect a toolkit that needs custom auth                  | Error is visible in the UI                                                    | n/a                                        |
| C6  | Approval decided twice (phone and web)               | prod     | Decide the same approval from two clients                 | Second gets 409, one wake                                                     | One `approval_` wake                       |

### Computer (#17)

| ID  | Scenario                                                         | Env      | Steps                                                                  | Pass criteria                                                                                                      | Duplicate check                                    |
| --- | ---------------------------------------------------------------- | -------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| P1  | Opens a site, writes a file, pauses (`computer-open`)            | prod     | Routine: open example.com, read the heading, write a file, don't click | Completed, heading correct, computer paused when the turn ends, seconds metered                                    | One computer per account                           |
| P2  | Committing click held, approved, runs once (`computer-approval`) | dev      | Fill and submit the httpbin echo form, then `decide approve`           | `blocked` with a pending approval and preview. After approval, the click runs once and the approval is `executed`. | `approvalsExecutedOverOne` = 0, no second approval |
| P3  | Survives pause and resume, watched over noVNC                    | prod web | After P1, a second run reads the file back. Watch live.                | File still there after pause and resume, desktop visible in the viewer                                             | n/a                                                |
| P4  | Busy message at the E2B cap                                      | prod     | 20 concurrent sandboxes                                                | Busy message, no crash                                                                                             | n/a                                                |

### Delegation and teams (#14)

| ID  | Scenario               | Env  | Steps                              | Pass criteria                                                   | Duplicate check       |
| --- | ---------------------- | ---- | ---------------------------------- | --------------------------------------------------------------- | --------------------- |
| D1  | Delegate to a teammate | prod | Paid account. "Ask <teammate> to…" | `brief_` turn runs in the teammate's chat, result reported back | One brief per request |
| D2  | Group chat handoff     | prod | Paid account, group chat           | Handoff tool moves the turn once                                | No bounce-back        |

### Recovery and limits

| ID  | Scenario                                                     | Env  | Steps                                             | Pass criteria                                                                                                      | Duplicate check                      |
| --- | ------------------------------------------------------------ | ---- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| X1  | Exhausted allowance skips the run (`allowance-exhausted`)    | prod | $1.00 already spent                               | Skipped with the allowance message, `routine_skipped` activity, no chat run                                        | Zero turns                           |
| X2  | Allowance runs out mid-turn (`allowance-mid-turn`)           | prod | $0.005 left, three searches asked                 | Searches refused, the bot says so, total spend stays within $1 (+$0.01)                                            | No search charged past the allowance |
| X3  | Nearly spent allowance (`allowance-nearly-exhausted`)        | prod | $0.005 left, long essays asked                    | Turn ends, outcome recorded, no overspend                                                                          | One turn                             |
| X4  | Turn interrupted mid-run (`interrupted-turn`)                | prod | Cancel the chat run mid-turn, then `rerun`        | The dead run gets an outcome (failed, with activity). The computer is released and paused. The next run completes. | One turn per run                     |
| X5  | Bot over the plan limit after a downgrade (`downgraded-bot`) | prod | Older second bot appears after the routine exists | Skipped with "isn't available on your current plan", no chat run                                                   | Zero turns                           |

## Adding a scenario

Add it to `scenarios` in `scripts/reliability-run.ts` with its pass criteria, add a row above, run it and log it in `runs.md`. Keep the fixture to a state a real account can reach.
