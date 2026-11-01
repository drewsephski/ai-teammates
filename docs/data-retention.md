# Data retention on account deletion

What a completed `deleteAccount` (`services/account.ts`) removes, what stays,
and for how long. Last checked October 18, 2026, against `@trigger.dev/sdk`
4.7.4. Issue: drewsephski/ai-teammates#8.

## Removed when deletion completes

- **Neon:** bots and their routines, approvals, approval rules and For you items
  (by cascade), direct and group chats with their members, **conversation
  history** (`chat_transcripts`, which cascades with each chat), memories and
  memory events, user settings, For you scans, sidebar preferences, connector
  auth attempts, the ChatGPT connection, saved API keys (`user_secrets`),
  activity events, push devices, the cached plan and the computer row.
- **Providers:** non-default Clerk Billing subscription items are canceled
  immediately. The E2B computer is deleted. Composio connected accounts are
  deleted. The ChatGPT connection is disconnected. Every Trigger.dev session is
  erased and closed, and its running turn canceled (see "What happens at
  Trigger.dev" below). Last, the Clerk user is deleted, which ends every session.
- Deleting a single chat or bot also deletes that chat's history and sealing
  key, since they cascade from `chats`, and erases its Trigger.dev session.

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

## What happens at Trigger.dev

Trigger.dev has no API to delete a session or run, and has not answered our
October 16 question (`docs/account-deletion-provider-question.md`). So we
remove what its primitives let us remove, and make the rest unreadable.

**Sealing (crypto-shredding).** Everything a chat sends into a session's input
stream is AES-256-GCM ciphertext under a per-chat key stored only in Neon
(`chat_content_keys`, cascading with the chat; `lib/chat-content-seal.ts`).
Clients append through our server, which seals the record and forwards it with
the client's own session token (`app/api/trigger/realtime/v1/sessions/[session]/in/append`,
`lib/chat-input-proxy.ts`). Server-sent turns (routines, approvals, the setup
greeting, delegation briefs, For you tasks) are sealed in `postChatMessage`
(`lib/chat-dispatch.ts`), and none of them puts text in `basePayload` any more.
The agent opens messages in `onValidateMessages`, before the runtime stores or
converts them (`trigger/chat.ts`; contract test `tests/chat-agent-sealing.test.ts`).
The SDK copies each turn's user text into the run trace (`chat.user_message`);
for a sealed message there is no text to copy. Deleting the chat deletes the
key, and every copy at Trigger.dev becomes ciphertext no one can open.

**Erasure** (`lib/trigger-session-erasure.ts`), before the chat row is deleted:

1. Cancel the running turn, so it can't write again.
2. Trim `.out` to nothing with S2's trim command, which deletes the records
   (eventually consistent, typically within minutes). Trigger.dev allows this
   only while the session is open, so it happens before the close. Our
   credentials can't trim `.in`, which is why it is sealed.
3. Overwrite the legacy transcript snapshot with an empty one.
4. Replace session metadata and tags (For you binding, delegation links) with
   an erasure marker, then close the session and check that Trigger.dev serves
   no transcript.

Account deletion waits for every chat's erasure and asks the person to retry on
failure. Deleting a bot or group chat erases best effort
(`services/chat-erasure.ts`), so a Trigger.dev outage can't block it: the key
still goes with the row, and the daily `erase-orphan-sessions` task
(`trigger/erase-orphan-sessions.ts`) erases any session whose chat is gone,
including chats deleted before this shipped. `scripts/verify-trigger-erasure.ts`
checks the whole sequence live against the development environment.

| Data at Trigger.dev                    | After deletion                                                                                                                                                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session input stream (`.in`)           | Sealed records stay until Trigger.dev's unpublished retention, unreadable. Records appended **before sealing shipped**, and by installed app builds that still append to Trigger.dev directly (iOS build 24 and earlier), are plaintext and stay readable there |
| Run trace `chat.user_message`          | Nothing readable for sealed messages. Plaintext for the messages above, for the plan's log window                                                                                                                                                               |
| Session output stream (`.out`)         | Trimmed. A session that had already closed or expired before erasure keeps about its last turn (chat.agent trims older turns itself)                                                                                                                            |
| Transcript snapshots                   | Overwritten with an empty snapshot                                                                                                                                                                                                                              |
| Session metadata and tags              | Replaced with `{ erasedAt }` and `erased`                                                                                                                                                                                                                       |
| Session `basePayload` and run payloads | New sessions hold only the chat ID. Sessions started before this change keep their setup greeting (with the first name), delegation brief or For you prompt and quote, readable                                                                                 |
| Run logs and traces                    | Our code logs no message text and Sentry gets IDs only (`trigger/init.ts`). Plan log retention: Free 1 day, Hobby 7 days, Pro 30 days ([pricing](https://trigger.dev/pricing))                                                                                  |
| Run metadata and tags                  | IDs only: `botId`, `chat:<chatId>`, `for-you`                                                                                                                                                                                                                   |

## Deployment order

The agent must be able to open sealed messages before anything sends one:

1. With owner approval, `pnpm db:push` to add `chat_content_keys` (additive).
2. Deploy the Trigger.dev worker (`npx trigger.dev@4.7.4 deploy --profile ai-teammates`):
   it opens sealed messages, still accepts unsealed ones from installed apps,
   seals routines and delegation briefs, and schedules the sweep.
3. Deploy Railway (push `main`): the input proxy, sealed web sends, approvals and
   For you, and erasure on deletion.
4. Ship an app build whose transport sends `.in` through `/api/trigger`
   (`krafty-mobile` `src/hooks/use-chat-transport.ts`). Until people update, their
   messages still reach Trigger.dev unsealed.

Then run `scripts/verify-trigger-erasure.ts`, delete a disposable account, and
check its sessions are closed with the erasure marker.

## Still to do

- Send the October 19 follow-up to Trigger.dev. What only they can settle: the
  retention of `.in` and run payloads, and erasure of the plaintext records
  written before sealing shipped. Update this file and `/privacy` when it arrives.
- Confirm which Trigger.dev plan the project is on. That sets the log window
  (1, 7 or 30 days).

## Sources

- [Trigger.dev transcript storage](https://trigger.dev/docs/ai-chat/transcript-storage)
- [Trigger.dev session close](https://trigger.dev/docs/management/sessions/close)
- [Trigger.dev session channels](https://trigger.dev/docs/management/sessions/channels)
- [S2 trimming](https://s2.dev/docs/concepts/trimming) ("Trimming removes records before a chosen sequence number")
- [Trigger.dev pricing (log retention)](https://trigger.dev/pricing)
- [Trigger.dev docs index](https://trigger.dev/docs/llms.txt)
- [Apple: offering account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
  ("If you're legally required to retain some user information, let people know
  what information will and won't be retained.")
