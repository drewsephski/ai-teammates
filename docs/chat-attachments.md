# Chat attachments

This is the authoritative attachment contract for the current source. The older
account-computer upload proposal in the platform plans is superseded. Production
schema, web/worker deployments and native binary verification are separate release
gates; local implementation and tests do not prove those releases happened.

## Wire contract

Mobile requests use Clerk bearer authentication and `/api/v1`'s private, no-store
responses. Routes call shared userId-based services; the worker uses
`lib/chat-attachments.ts` without importing services.

- `POST /api/v1/chats/:chatId/attachments`: raw file bytes with `Content-Type`
  and URI-encoded `X-File-Name`. Returns HTTP **200** and
  `{ attachment: { id, filename, mediaType, size, url } }`. `size` is bytes.
  The opaque URL identifies the upload; it is not a public download URL.
- `GET /api/v1/chats/:chatId/attachments/:attachmentId`: HTTP 200 with
  `{ attachment: { id, filename, mediaType, size, base64 } }`. Owner and chat
  must match. Fetch previews through this authenticated endpoint.
- `DELETE /api/v1/chats/:chatId/attachments/:attachmentId`: discard an unused
  draft, returning HTTP 200 `{ ok: true }`. A pinned or saved-transcript reference
  returns 409 `conflict`; repeat deletion of an unused missing file is harmless.
- `POST /api/v1/chats/:chatId/context`, JSON `{ sourceChatId }`: checks ownership
  of both chats and returns HTTP 200 with the same attachment metadata as upload.
  This is a text snapshot of the most recent 30 source entries, user/assistant
  text only, at most 6,000 characters per entry and 50,000 combined characters.
  It excludes tool output and earlier attachments, and does not stay in sync with
  the source. An empty source returns 400 `invalid_request`.

Send the returned reference as an AI SDK user file part alongside optional text:

```ts
{
  type: "file",
  filename: attachment.filename,
  mediaType: attachment.mediaType,
  url: attachment.url,
}
```

No computer path or metadata attachment array is involved. New input must use
uploaded references; arbitrary remote URLs and inline data URLs are rejected.
The sealing proxy encrypts the message for the session input stream; legacy
clients that append directly still pass through the same worker validation.

## Limits and errors

| Limit    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| File     | 10 MiB                                                     |
| Message  | 5 file parts, 20 MiB combined (repeated references count)  |
| Chat     | 100 files, 100 MiB total, including pinned uploads         |
| Filename | 1–180 characters, no path separators or control characters |

Allowed types are `image/jpeg`, `image/png`, `image/webp`, `image/gif`,
`application/pdf`, `text/plain`, `text/markdown`, `text/csv` and `application/json`.
Image/PDF signatures and UTF-8 text bytes are checked; SVG, HTML, executables and
unlisted types are rejected. The streaming reader enforces actual bytes regardless
of Content-Length. Errors retain the API envelope `{ error: { code, message,
issues? } }`: invalid names/input are 400 `invalid_request`, missing or foreign
chats/files are generic 404 `not_found`, upload/quota overflow is 413
`payload_too_large`, and unsupported types/bytes are 415 `unsupported_media_type`.
Message reference/count/size errors arrive through the worker's turn error stream,
before model generation; an append acknowledgment is not that validation result.

## Storage, acceptance and recovery

`chat_attachments` stores bytes encrypted with the chat's AES-GCM content key,
bound to the chat and attachment ID. Files and keys cascade with chat deletion.
Uploads and snapshots do not wake E2B, make model calls or spend computer seconds.
Transcripts and session input retain references, never hydrated upload bytes.

Worker acceptance is: bind the callback to the trusted session, open the message,
validate every incoming user reference against that owner's chat, enforce message
limits, and pin all referenced rows in one transaction. The nullable `referencedAt`
pin is permanent until chat deletion. Validation, upload quota/cleanup, draft
deletions and transcript saves all take the chat row lock first. A transcript
save also pins existing references in the same transaction as its write; shortening
history never unpins a file.

Unused drafts older than 24 hours are reclaimed on the next upload to that chat.
Pinned files and references in saved transcripts are excluded. An open draft or
queued input can expire before worker validation. If deletion/cleanup wins first,
the worker rejects the new reference. HTTP 200 from upload or append alone does
not guarantee acceptance of a queued attachment. The SDK error-path snapshot is
restored to the previously accepted history so rejected input cannot poison later
turns; the client still receives the turn error.

During generation, a missing historical uploaded reference can become
`[Earlier attachment unavailable; ask the person to attach it again]`. This lets a
later text-only turn proceed. Required current references stay strict. Cross-chat
references, arbitrary URLs, database errors and decryption/integrity failures
never become placeholders. Direct hydration defaults to strict behavior; only
the worker's validated delta selects historical recovery. The stored transcript
is not rewritten with placeholders or decrypted bytes.

Text files become bounded text parts, at most 60,000 characters per file with an
explicit truncation notice. Images/PDFs become native model file data. Model
routing remains in the existing model layer, including document-capable PDF
handling. Full web upload/context UI remains deferred under plan 008; plan 007
explicitly rejects web files in the meantime.

## Verification and release

Offline PGlite tests and the installed Trigger SDK harness cover encryption,
tenancy, byte hydration, limits, concurrent quota checks, validation/deletion/
cleanup ordering, transcript pinning, snapshots, cascades, missing-history recovery
and rejection before the fake model runs. SDK transcript conformance, failed-load
protection and cursor behavior remain tested. These are not live provider or
signed-in device checks.

Review and separately authorize `pnpm db:push` before releasing code that reads
`referencedAt` (and the event identity columns from plan 005). No migration or
backfill is required. Release the API on Railway and the worker with the SDK-pinned
Trigger CLI and `--profile ai-teammates`, each only when authorized. Native client
limits and picker/sharing behavior must be checked in its separate repository and
appropriate binary; this change does not establish its release readiness.
