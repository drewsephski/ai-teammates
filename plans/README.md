# Implementation plans

Prepared with the improve skill on **2026-11-02 (America/Chicago)** against commit **7d4d373** in `/Users/drewsepeczi/ai-teammates`.

The owner selected audit findings #1–5 in order, explicitly kept #4 and #5 separate, selected #6 paired with documentation finding #8, and requested an immediate unsupported-file rejection before later full web attachment support. Implementation of 001–007 was authorized on 2026-11-02; 008 remains deferred. The implementation evidence below records local verification before release. The owner subsequently authorized committing and deploying 001–007; see the release note at the end. No branch or worktree was created.

## Execution order and status

1. [001 — Upgrade Next.js and verify compatibility](001-upgrade-nextjs.md) — **P1 · S–M · MED risk · DONE**. Finding #1. First in the selected sequence.
2. [002 — Bind worker turns to the trusted session](002-bind-worker-session.md) — **P1 · M · MED risk · DONE**. Finding #2. After 001.
3. [003 — Enforce the input limit during streaming](003-stream-chat-request-limit.md) — **P1 · S · LOW risk · DONE**. Finding #3. After 002; retain its input checks.
4. [004 — Recover failed event deliveries safely](004-retry-failed-event-deliveries.md) — **P1 · S · LOW risk · DONE**. Finding #4. After 003; finish and verify this change independently.
5. [005 — Atomic event admission and stable run IDs](005-atomic-event-admission.md) — **P1 · L · MED risk · DONE**. Finding #5. Only after 004. Larger than the initial estimate because identities also drive accounting, approvals and run recovery.
6. [006 — Attachment lifecycle, recovery and contract correction](006-attachment-lifecycle-and-contract.md) — **P1 · M–L · MED risk · DONE**. Findings #6 + #8 together. Next after the first five; relies on trusted worker identity from 002.
7. [007 — Explicitly reject unsupported web files](007-reject-unsupported-web-files.md) — **P2 · S · LOW risk · DONE**. Immediate interim response to #7; no technical prerequisite. It may be executed before 006, independently of the ordered 001–005 chain. “Immediate” means do not defer this fix until full upload support.
8. [008 — Full web attachment and conversation-context support](008-web-attachment-support.md) — **P2 · L · MED risk · TODO — DEFERRED**. Future feature work, not the interim fix. Requires completed 006 and 007 and a refresh against their actual interfaces before execution.

Status vocabulary: TODO / IN PROGRESS / DONE / BLOCKED (reason) / REJECTED (reason). Executors update only their row and plan evidence. DONE means the plan's local done criteria passed; deployments and real-device verification are tracked separately.

## Dependency notes

```text
Requested sequence: 001 -> 002 -> 003 -> 004 -> 005 -> 006
Immediate independent fix: 007
Deferred full web support: (006 + 007) -> 008
```

- Do not combine 004 and 005 into one implementation. The first fixes retry cleanup with a post-attempt boundary; the second changes database admission and event identity. Keep the first regression intact.
- 002 and 003 both touch the input proxy; execute sequentially. 002 also protects worker identity for legacy clients that bypass the proxy.
- 006 includes both the code and stale-contract repair. Its acceptance boundary is worker validation, not an HTTP append acknowledgment; unavailable old references must not block future text replies.
- 007 is intentionally small and application-owned. 008 replaces its blanket restriction only after all supported file input/send/retry paths work.
- Known prerequisite changes are expected drift. Inspect and preserve those diffs even when they are uncommitted; unexplained source drift is a STOP condition.
- Schema changes in 005/006 require a reviewed, separately authorized `pnpm db:push` before a release. No migrations or backfills.
- Worker/lib changes need a separately authorized Trigger deploy as well as any Railway release. Do not treat a push as harmless: main pushes deploy Railway.

## Verification baseline and scope

At 7d4d373, the audit ran `pnpm typecheck --incremental false`, `pnpm test` (**1,131 passed**), and lint on the reviewed source files, all successfully. Additional offline PGlite probes reproduced event cap overflow, suppressed retries and missing-attachment follow-up failures. Dependency applicability was checked against the official Next advisory.

This was a standard audit of high-change/high-risk areas, not every source file. It did not verify live provider behavior, current production configuration, signed-in browser/device flows, the separate mobile repository, or a production build. No live exploit of the session-binding issue was attempted. Plan 002 requires a proper offline SDK input-boundary regression rather than elevating static evidence to a proven remote exploit.

Each plan is standalone: current-state excerpts, scope, architecture constraints, commands, tests, done criteria, STOP conditions and release implications are inlined. Commands in plans are for their future executor; they have not been run as implementation steps by the advisor.

## Findings considered and rejected or deferred

- Image-file hydration bypass: rejected. The installed AI SDK maps both image and PDF UI files to the file parts handled by hydration; checked offline.
- Analytics OAuth callback leakage: rejected for the inspected path because the installed analytics SDK excludes /api.
- Shell network writes, imperfect vision guard and push-token rebinding: documented limitations, not newly established bugs.
- Blanket critical-vulnerability claims from dependency-audit counts: rejected. The selected Next finding is the applicable Server Actions advisory; no unsupported claim that this app enables use-cache or attacker-controlled next/og rendering.
- Broad monolith refactors and storage migrations: deferred; no concrete benefit justified their risk during this audit.
- Old attachment storage proposal as a mandatory architecture: rejected. Update the handoff docs to current code; Phase 4 being marked planned is not proof of a shipped API regression.
- Project-specific worker profile omissions in generic/template setup docs: lower priority and not selected; no deployment failure was demonstrated.
- Event/one-off schedule forms and reusable workflows: grounded future options but not selected here.
- Lost event between database reservation and remote append: remains an explicit limitation of 005, which does not add a durable outbox or claim exactly-once external effects.
- Full web attachment support: selected as deferred 008, gated behind lifecycle repair, with 007 as the immediate safe behavior.

## Advisor artifact checks

Before handing off, verify all eight plan files exist, their dependency links resolve, each is stamped 7d4d373, and this planning session changed only plans/. Do not run production schemas, upgrades or source-formatting commands to “validate” a written plan.

## Local execution result — 2026-11-02

Plans 001–007 are DONE; 008 remains deferred. Plan 004 was verified independently before 005. The final offline suite passes 1,204 tests, with typecheck and scoped lint/format checks passing. Each completed plan records its implementation evidence. At the local-verification checkpoint, changes were uncommitted on main and no production schema push or deployment had occurred. Signed-in browser/device verification remains a separate gate.

Final combined `pnpm build` also passed using the CI placeholder database URLs and disabled Sentry upload; the custom `.server/server.mjs` bundle was emitted (113.2 kB). Build log: `/tmp/krafty-final-build.log`.

## Release authorization — 2026-11-02

The owner requested "commit and deploy all" after local verification. Applied and read back only the three additive columns: `routines.last_run_id`, `routine_events.run_id`, and `chat_attachments.referenced_at`. Used `pnpm db:push` with a temporary filtered config/schema referencing the repository definitions; reviewed the exact three `ADD COLUMN` statements before confirming. Aborted the unfiltered preview, which included unrelated default/constraint normalization. No migration, backfill, drop or unrelated schema change was applied.

The release uses a commit on main, its GitHub-triggered Railway deployment, and the separately pinned Trigger.dev 4.7.4 deployment with profile `ai-teammates`. Final deployment identifiers and observed statuses are reported in the execution chat. Plan 008 stays deferred.
