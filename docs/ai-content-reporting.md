# AI content reports

Native clients submit an authenticated `POST /api/v1/chats/:chatId/messages/:messageId/report` with `{ "reason": "offensive" | "unsafe" | "inaccurate" | "other", "details"?: string }`. Details are trimmed and limited to 1,000 characters. The API accepts only the existing Clerk bearer token; web server actions use their existing Clerk session.

The owner must have the chat, and the message ID must identify an assistant message in the server transcript. User messages and invented message IDs return `404 not_found`. The request cannot supply user identity or message content. A new durable report returns `201 { "reported": true }`; retries return `200` with the same body. The first reason/details are retained. Database/provider failures return errors, never a successful report acknowledgment.

The report captures only the assistant's visible text parts, not tool arguments/results, screenshots, the prompt, or the rest of the conversation. Reports are sensitive user data. Do not paste raw reports into GitHub issues, logs, or vendor messages.

## Deployment order

1. Review and approve the additive `ai_content_reports` table in `db/schema.ts`.
2. An authorized operator applies it with the repository's `pnpm db:push` workflow before deploying the server. Do not generate migration files. Inspect the proposed diff for unexpected changes before applying.
3. Deploy the server, then ship the mobile reporting UI. No new provider credentials or environment variables are required.
4. With a disposable account, report a real assistant response, verify the row through authorized administration, retry it, and verify account deletion clears the row. Offline tests alone do not close the release gate.

## Operator triage

There is no public list/read endpoint. An authorized operator checks the queue through secure database administration daily during release testing and ongoing operation. Receiving a report does not itself remove or moderate content. Review the report, reproduce safely, decide whether a prompt/model/tool restriction or other fix is needed, and track the fix without copying personal content. Urgent safety reports take priority. Monitor unresolved counts and the age of the oldest report.

Start with metadata; retrieve text only for the specific report being reviewed:

```sql
SELECT id, reason, created_at
FROM ai_content_reports
WHERE reviewed_at IS NULL
ORDER BY created_at ASC
LIMIT 100;

SELECT id, message_text, details
FROM ai_content_reports
WHERE id = $1;

-- Only after review and any necessary follow-up is tracked.
UPDATE ai_content_reports SET reviewed_at = now()
WHERE id = $1 AND reviewed_at IS NULL;
```

The report's `chat_id` foreign key uses `ON DELETE CASCADE`. Deleting that chat, or account deletion's owner-scoped chat deletion, removes the complete report and its captured text. Reports are not billing records and are not retained independently of the account/chat. Clerk IDs have no local users table, so the owner is stored as text and deletion follows the existing chat lifecycle. Provider transcript retention is a separate account-deletion concern; this table does not claim to erase Trigger.dev storage.
