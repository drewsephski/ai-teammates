# Computer capacity plan (E2B)

For issue #17 (B7). Written 2026-11-01 from the code on `main` (`9ee7845`) and E2B's public pages read the same day. Nothing in this document was measured at the cap: the cap test (P4) is still blocked on E2B budget, see [`reliability/runs.md`](reliability/runs.md).

Any change to the E2B plan, a payment method, a spending limit or concurrency add-ons needs Drew's approval. `AGENTS.md` also says E2B stays on Hobby, so moving to Pro means changing that rule too.

## How computers work today

- **One computer per account.** All of a person's bots share it. The `computers` table holds one row per account, and `ensureAccountComputer` (`lib/account-computer.ts`) creates the E2B sandbox on first use under the lock `computer:<userId>`.
- **Created paused.** `createAccountSandbox` (`lib/e2b.ts`) creates the sandbox from the `krafty-desktop` template, hardens the shell, then pauses it. It runs only while something uses it. It is created with `lifecycle: { onTimeout: "pause", autoResume: false }`, so E2B pauses it, never kills it, when its timeout passes.
- **Size.** `scripts/build-e2b-template.ts` builds the template with 8 vCPU and 8 GiB, the same as E2B's desktop template. E2B bills allocated resources, so this sets the price per running second.
- **Bots take turns.** A turn takes the account's lease before every computer call (`acquireComputerLease`). Another turn waits up to 60 seconds (`LEASE_WAIT_MS`), then gets `{ status: "busy", heldBy }`. The lease lapses 2 minutes after the holder's last call (`LEASE_TTL_MS`). Rules are in `lib/computer-lease-policy.ts`. This is per account and has nothing to do with E2B's cap.
- **Every E2B call goes through `withComputer`** (`lib/e2b.ts`, `lib/sandbox-lifecycle.ts`). It meters, checks the allowance, resumes the sandbox if paused (`Sandbox.connect`), and sets its timeout. All timing constants are in `lib/sandbox-policy.ts`:
  - **5-minute idle pause** (`IDLE_TIMEOUT_MS`). After each call the timeout is reset to 5 minutes, so a computer pauses itself 5 minutes after its last use. With little allowance left it is a quarter of what remains, never under 30 seconds (`idleTimeoutMs`).
  - **55-minute session cap** (`SESSION_LIMIT_MS`), 5 minutes below Hobby's one-hour limit. A call that would run past it pauses the computer and resumes it, which starts a new session.
  - **Allowance cap.** The timeout never runs past the owner's remaining computer seconds, so E2B pauses the computer when the allowance runs out even if nothing checks again.
- **Pause on turn end.** `onTurnComplete` in `trigger/chat.ts` releases the lease and calls `pauseComputerIfLowAllowance`. Free accounts pause at once. Paid accounts pause only when 60 seconds or less are left (`LOW_ALLOWANCE_SECONDS`); otherwise their computer runs until the 5-minute idle pause.
- **A watched screen keeps running.** The desktop gateway (`lib/desktop-gateway.ts`) renews the computer every 10 to 30 seconds (`desktopHeartbeatMs`) while a viewer is connected, up to the 55-minute session cap.
- **Metering and cleanup.** The `meter-sandboxes` cron (`trigger/usage.ts`) runs every minute. It frees the lease of a turn that died mid-turn and pauses its computer (the fix for #34), meters every session into `usage_entries` (seconds), pauses computers whose owner has no time left, deletes orphans, and every tenth minute deletes free computers idle for 30 days.
- **Plan allowances** (`planLimits` in `lib/billing-policy.ts`): free accounts get 20 minutes of computer time a month (1,200 seconds, renewed on the 1st, UTC). Paid accounts ($20 a month) get 50 hours per billing period. Free turns may make 20 computer calls (`FREE_COMPUTER_CALLS_PER_TURN`).

## E2B Hobby limits

From [e2b.dev/pricing](https://e2b.dev/pricing), [docs.e2b.dev/billing](https://docs.e2b.dev/billing), [docs.e2b.dev/faq/paused-sandboxes-concurrency](https://docs.e2b.dev/faq/paused-sandboxes-concurrency) and [docs.e2b.dev/faq/calculate-sandbox-price](https://docs.e2b.dev/faq/calculate-sandbox-price), read 2026-11-01.

| Limit                    | Hobby                                        | Pro                                                  |
| ------------------------ | -------------------------------------------- | ---------------------------------------------------- |
| Base price               | $0 a month                                   | $150 a month plus usage                              |
| Credits                  | $100, one time                               | None added on upgrade                                |
| Concurrent sandboxes     | 20                                           | 100; each add-on adds 500 for $500 a month, to 1,100 |
| Session length           | 1 hour of continuous running without a pause | 24 hours                                             |
| Sandbox creation rate    | 1 a second                                   | 5 a second                                           |
| Max size                 | 8 vCPU, 8 GiB                                | 8+ vCPU, 8+ GiB                                      |
| Paused sandbox retention | Unlimited                                    | Unlimited                                            |

- Only running sandboxes count toward the concurrency limit. Paused ones don't, and they aren't billed.
- Usage costs $0.000014 per vCPU-second and $0.0000045 per GiB-second. At 8 vCPU and 8 GiB that is $0.000148 a second, about **$0.53 per running hour**. The $100 credit covers about 188 running hours in total.
- When the credits run out: "If you have no payment method, every project in your workspace is blocked shortly afterwards." E2B offers spending limits on the dashboard's budget page.
- Not checked: how much of the $100 is left, and whether a payment method is on file. Both are in the E2B console, which agents don't open.

## What happens at the cap

E2B refuses to resume or create a sandbox when 20 are running. `isProviderCapacityError` (`lib/sandbox-policy.ts`) treats `RateLimitError`, `ServiceBusyError`, status 429 or 503, and messages mentioning concurrent, quota, rate limit or too many sandboxes as capacity. `mapProviderError` (`lib/e2b.ts`) logs it to Sentry as a warning tagged `sandbox.operation: capacity` and rethrows it as `COMPUTERS_BUSY_ERROR`: "Computers are busy right now. Try again in a few minutes." Nothing queues or retries.

The exact error E2B returns at the concurrency cap has not been seen live. The mapping is tested only with synthetic errors (`tests/sandbox-policy.test.ts`, `tests/e2b.test.ts`).

What each surface shows:

- **Chat.** The computer tool throws, so the tool part ends in `output-error` with that text (`components/chat-tool-call.tsx`). The model sees the same text. `lib/chat-instructions.ts` tells the model what to do when a bot holds the computer (`status: busy`), but says nothing about this error, so the model may retry until the step cap. An unattended routine turn reports the failure and is not retried later.
- **Web screen panel, first computer.** `getDesktopUrl` (`actions/chat.ts`) returns `{ ok: false, reason: "capacity" }`. The panel shows the busy message with a "Try again" button, in a `role="status"` element (`components/desktop-panel.tsx`).
- **Web screen panel, existing computer.** This is the common case, and the message does not appear. `getDesktopUrl` only reads the paused computer's state, which succeeds. The resume happens in the gateway (`getDesktopConnection`), which rejects the WebSocket with HTTP 503. noVNC reports a disconnect and the panel shows "Resume computer" with no explanation.
- **Mobile.** `POST /api/v1/chats/:id/desktop` maps the busy error to 503 with code `upstream` (`lib/api-response.ts`). Like the web panel, it fails that way only when creating the first computer. For an existing computer the route succeeds and the socket is rejected with 503.

A turn that runs past the 55-minute session cap pauses and resumes its computer, so it also needs a free slot at that moment.

## Expected concurrency at 200 users

By Little's law, the average number of running computers is how many people use one, times how long each runs:

```
C = U × a × c × m / 60
```

- `U`: accounts.
- `a`: share of accounts active in the busiest hour.
- `c`: share of active people whose bots use the computer that hour.
- `m`: minutes each of those computers runs in the hour. This includes the work itself, plus 5 minutes after a paid turn's last computer call (idle pause; free computers pause at turn end), plus any time the screen is watched.

Arrivals are roughly independent, so the number running at once is close to Poisson with mean `C`. The chance that more than 20 run at once is about 0.01% at `C = 8`, 0.2% at `C = 10`, 1.2% at `C = 12`, 8% at `C = 15` and 44% at `C = 20`.

For a short burst, such as a launch post, use the window instead: `C = arrivals in W minutes × m / W`, with `m` no larger than `W`.

These assumptions are guesses with no production data behind them. Replace them once Sentry and `sandbox_sessions` have real numbers.

| Scenario                                                      | a                   | c    | m      | C at U = 200 | Over 20?             |
| ------------------------------------------------------------- | ------------------- | ---- | ------ | ------------ | -------------------- |
| Normal day                                                    | 15%                 | 40%  | 10 min | 2            | No                   |
| Busy launch day, peak hour                                    | 30%                 | 50%  | 15 min | 7.5          | About 1 in 25,000    |
| Launch burst                                                  | 60 people in 15 min | all  | 8 min  | 32           | Yes, for that window |
| Ceiling: every free account spends its 20 minutes in one hour | 100%                | 100% | 20 min | 67           | Yes                  |

The `m` values: a free account has 20 minutes in total, so 10 minutes in one hour is heavy use. Paid accounts add up to 5 idle minutes per turn and are the reason `m` reaches 15.

At 200 users, Hobby's 20 slots hold for normal and busy hours. They do not hold for a burst where a few dozen people try the computer in the same quarter hour, which is the launch-day case the issue worries about.

**Credits run out before concurrency does.** At 7.5 computers running on average, the computers cost about $4 an hour, and the $100 credit lasts about 25 such hours. If 200 free accounts each spend their full 20 minutes, that is 67 running hours, about $36. One paid account using its full 50 hours costs about $27 a month at the current template size, more than its $20 price. With no payment method, E2B blocks every project when the credit is gone, and then every computer call fails.

## Risks at the cap

- People whose computer already exists see "Resume computer" with no reason when the screen fails to open (web and mobile).
- Bots may retry the busy error inside a turn. Each retry fails fast, but it uses steps and model calls.
- Routines that need the computer fail at the cap and don't run again until their next schedule.
- New accounts in a burst also hit the 1-a-second creation rate, and each new computer takes a slot while it starts and is hardened, before it pauses.
- When a paid turn finishes, its computer holds a slot for 5 more minutes, as does a screen left open.
- Unverified: whether E2B's real error at the cap matches `isProviderCapacityError`. If it doesn't, people get a generic error instead of the busy message.

## Options

| Option                                        | Cost                                                       | What it changes                                                                                                                                                                                                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Stay on Hobby and fix the busy message     | $0 plan fee; usage still from the $100 credit              | Code only: show the busy message when the gateway's resume fails (have `getDesktopUrl` resume, or close the socket with a reason the panel shows); tell the model in `lib/chat-instructions.ts` not to retry `COMPUTERS_BUSY_ERROR`; add a Sentry alert on `sandbox.operation: capacity`. |
| 2. Hobby with a short queue                   | $0 plan fee                                                | Retry a capacity error for up to about 60 seconds inside the tool, as the lease wait does, before returning busy. Smooths short bursts. Longer turns at the cap.                                                                                                                          |
| 3. Pause paid computers at turn end           | $0                                                         | Same as free accounts. Removes the 5-minute idle tail after each paid turn, which lowers `m` for paid accounts and also saves credit. The next turn pays a resume. A shorter `IDLE_TIMEOUT_MS` (for example 2 minutes) is a milder version.                                               |
| 4. Smaller template                           | $0                                                         | Doesn't change the cap. At 2 vCPU and 4 GiB a running hour costs about $0.17 instead of $0.53, so the credit lasts about three times as long. Needs a template rebuild and a check that Firefox and the desktop stay usable.                                                              |
| 5. Add a payment method with a spending limit | Usage beyond $100, capped by the limit                     | Keeps E2B from blocking every project when the credit runs out. A billing change: **needs Drew's approval.**                                                                                                                                                                              |
| 6. E2B Pro                                    | $150 a month plus usage; +$500 a month per 500 extra slots | 100 concurrent, 24-hour sessions, 5 creations a second. Only worth it once the busy rate in Sentry is real. A plan change: **needs Drew's approval**, and `AGENTS.md` must be updated.                                                                                                    |

Recommendation: do 1 and 3 before launch, decide on 5 before launch because running out of credit stops every computer, and leave 6 until the capacity warnings show the cap is being hit.

## Still to verify

- P4: the busy message at 20 running computers, with recording and sandbox IDs. Needs 20 sandboxes and Drew's go-ahead on the credits.
- P3: a file surviving pause and resume.
- The credit balance and whether a payment method is on file (E2B console).
- That E2B bills the template's 8 vCPU and 8 GiB, by comparing a known session against the console.
