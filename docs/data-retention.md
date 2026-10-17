# Data retention on account deletion

What a completed `deleteAccount` (`services/account.ts`) removes, what stays,
and for how long. Last checked October 17, 2026, against `@trigger.dev/sdk`
4.7.4. Issue: drewsephski/ai-teammates#8.

## Removed when deletion completes

- **Neon:** bots and their routines, approvals, approval rules and For you items
  (by cascade), direct and group chats with their members, **conversation
  history** (`chat_transcripts`, which cascades with each chat), memories and
  memory events, user settings, For you scans, sidebar preferences, connector
  auth attempts, the ChatGPT connection, activity events, push devices, the
  cached plan and the computer row.
- **Providers:** non-default Clerk Billing subscription items are canceled
  immediately. The E2B computer is deleted. Composio connected accounts are
  deleted. The ChatGPT connection is disconnected. Every Trigger.dev session is
  closed and its running turn canceled. Last, the Clerk user is deleted, which
  ends every session.
- Deleting a single chat or bot also deletes that chat's history, since it
  cascades from `chats`.

## Reporting capability dependency (separate candidate)

The AI-content reporting workstream adds `ai_content_reports`: the reported
assistant's visible text only, a reason, optional user-supplied details,
account/chat/message identifiers, creation time and an optional review time.
It does not copy prompts, tool outputs or the full transcript. Its chat foreign
key cascades on chat deletion, including account deletion through the owned
chats. These report rows are not billing records and have no retention exception.
The privacy draft describes this conditional reporting behavior. This candidate
has not been deployed; coordinate its approved schema and code release with the
reporting PR before publishing that disclosure as current product behavior.

## Kept in Neon on purpose

`usage_entries`, `sandbox_sessions` and `usage_holds` stay as the billing
record, keyed by the now-unused user ID. They hold amounts and IDs, not message
text. Deleted rows also survive in Neon's point-in-time restore history until
the project's restore window passes.

## What stays with Trigger.dev

No supported deletion or redaction API for runs, sessions, session streams or
transcript snapshots was found in the installed Trigger.dev 4.7.4 SDK and docs.
The vendor has not yet confirmed an erasure procedure or all retention periods. The management API offers list,
retrieve, cancel, replay and reschedule for runs, and start, retrieve, update,
close and list for sessions. **Closing a session stops new messages; it deletes
nothing.** We asked Trigger.dev on October 16
(`docs/account-deletion-provider-question.md`) and had no answer when this was
written.

| Data at Trigger.dev            | Contents                                                                                                                                                                                                                                                                                    | Retention                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Session input stream (`.in`)   | Each message the person sent, including text                                                                                                                                                                                                                                                | Not published. The transcript storage docs say "Session streams still hold message content for their retention window" and give no length. |
| Session output stream (`.out`) | Streamed reply chunks. chat.agent trims it to about the last turn; records below the trim are "eventually deleted"                                                                                                                                                                          | Not published                                                                                                                              |
| Run payloads                   | The first message of a session started with one, copied from `basePayload`: the bot setup opening prompt (`lib/bot-setup-session.ts`), a delegation brief (`lib/team-delegation.ts`), and a For you prompt with its quoted source (`services/for-you.ts`). Other turns arrive through `.in` | Not published                                                                                                                              |
| Run logs and traces            | Task logs and spans. Our code doesn't log message text, and Sentry gets IDs only (`trigger/init.ts`). The SDK's own log lines haven't been audited                                                                                                                                          | Plan log retention: Free 1 day, Hobby 7 days, Pro 30 days ([pricing](https://trigger.dev/pricing))                                         |
| Run metadata and tags          | `botId`, `chat:<chatId>`, `for-you`                                                                                                                                                                                                                                                         | Not published                                                                                                                              |
| Session records                | `externalId` (chat ID), tags, metadata: For you `toolkit` and `accountId`, delegation `sourceChatId`, `delegationDepth` and `delegationMessageId`                                                                                                                                           | Not published                                                                                                                              |
| Transcript snapshots           | The full conversation, written by chat.agent's default storage **before this change reached the worker**. New turns no longer write one (see below)                                                                                                                                         | Not published, and no supported delete                                                                                                     |

## What this change does

`trigger/chat.ts` sets `storage: chatTranscriptStorage`
(`lib/chat-transcript-storage.ts`), so the conversation history lives in Neon
and goes with the chat. In the SDK, only the built-in snapshot storage writes
the snapshot (`snapshotTranscriptStorage.save`, which calls
`writeChatSnapshot`). With our storage set, new turns write no snapshot. The UI
and teammate consultations read history from Neon too.

That covers the main copy. Per Trigger.dev's docs, "Bringing your own database
does not remove platform custody": the session streams and run data in the
table above still pass through and stay with Trigger.dev for their unpublished
retention.

Snapshots written before the worker deploy stay where they are. For an existing
chat without a Neon row, the adapter reads its legacy snapshot so deployment
does not discard visible history or model context. The next worker save writes
the complete loaded transcript to Neon. Even an empty Neon transcript is then
authoritative; the adapter never falls back for a deleted chat. There is no
bulk migration and no deletion of provider snapshots.

## Deployment gate

This is a code candidate, not evidence that production uses Neon transcripts.
The new `chat_transcripts` table must exist before either application or worker
uses this code. No schema push or production data operation was performed.
Obtain owner approval for the additive schema change, then release matching
Railway and Trigger.dev 4.7.4 code. Verify an existing conversation, a new
conversation, a continuation after worker restart, and deletion of a disposable
account before claiming live behavior. Roll forward on faults: rolling the
worker back to default storage would read stale legacy snapshots and omit new
Neon-only messages. Neon ownership reduces one retained copy; it does not close
the vendor-erasure release gate.

## Still to do

- Drew sends the existing October 19 follow-up draft. No follow-up was sent by
  this recovery. The vendor's answer: an erase API, or published retention for streams, runs
  and sessions. Update this file and `/privacy` when it arrives.
- Confirm which Trigger.dev plan the project is on. That sets the log window
  (1, 7 or 30 days).
- Optional: start bot setup, delegation and For you sessions with
  `trigger: "preload"` and append the first message, so its text is not copied
  into `basePayload`. It would still pass through `.in`.

## Sources

- [Trigger.dev transcript storage](https://trigger.dev/docs/ai-chat/transcript-storage)
- [Trigger.dev session close](https://trigger.dev/docs/management/sessions/close)
- [Trigger.dev pricing (log retention)](https://trigger.dev/pricing)
- [Trigger.dev docs index](https://trigger.dev/docs/llms.txt)
- [Apple: offering account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
  ("If you're legally required to retain some user information, let people know
  what information will and won't be retained.")
