# Chat attachments

Mobile uploads use Clerk bearer authentication and `/api/v1`'s existing private,
no-store response handling. Route handlers call shared userId-based services;
the worker imports `lib/chat-attachments.ts` without importing services.

- `POST /api/v1/chats/:chatId/attachments`: raw bytes, Content-Type and an
  `X-File-Name` URI-encoded filename. Returns `{ attachment: { id, filename,
  mediaType, size, url } }`. The URL is an opaque reference, not a public download.
- `GET /api/v1/chats/:chatId/attachments/:attachmentId`: authenticated preview
  response containing metadata and base64 bytes. Both owner and chat must match.
- `DELETE /api/v1/chats/:chatId/attachments/:attachmentId`: discard an unused
  upload; files already referenced in the saved transcript are protected.
- `POST /api/v1/chats/:chatId/context`, `{ sourceChatId }`: verifies ownership of
  both chats and creates a text snapshot. No provider or model call is made.

Uploads are streamed with an actual byte cap, independent of Content-Length.
Allowlisted MIME types are checked against image/PDF signatures or valid UTF-8.
SVG, HTML, executables and unlisted formats are rejected. Per-file limit is 10
MiB; a message may reference at most five files / 20 MiB. Each chat is limited to
100 files / 100 MiB, with quota checks serialized under its row lock. Unreferenced
uploads older than 24 hours are reclaimed when that chat next receives an upload.

The `chat_attachments` table stores bytes encrypted with the chat's existing
AES-GCM content key, bound to its chat and attachment ID. Rows and keys cascade
when the chat is deleted. The mobile client sends small file references through
the existing sealing proxy. The worker resolves those references after its owner
checks and before model generation; decrypted bytes never replace the references
in the persisted transcript. It rejects external user file URLs rather than
letting the model SDK fetch arbitrary network addresses. Text attachments become
bounded text parts (60,000 characters per file, with an explicit truncation
notice), while image/PDF bytes become native model file parts. The gateway routes
PDF history through its document-capable Responses model; Anthropic and the
optional ChatGPT provider continue through their existing model selection.

The storage service deliberately uses the existing database and content-key
lifecycle. A larger upload product should move encrypted object bytes to blob
storage behind the same ownership/service contract; the per-chat limits prevent
this implementation from becoming an unbounded file drive.

## Release

The new table is additive. Review `pnpm db:push` output for unrelated destructive
changes before applying the table to the shared database. Deploy the API through
the normal Railway release and deploy the worker with the pinned Trigger.dev CLI
and `--profile ai-teammates`. The mobile feature requires a new native binary for
its SDK-compatible picker/sharing modules. Apply the schema before deploying the API/worker and distributing the native
build; verify all three against the intended source commits.

`tests/chat-attachments.test.ts` uses in-memory PostgreSQL and real AI SDK
message conversion to verify byte hydration, encryption, tenancy, chat isolation,
PDF data, size/count limits, quota serialization, snapshot isolation, cleanup,
and deletion cascades. No external provider, customer data, or credits are used.
