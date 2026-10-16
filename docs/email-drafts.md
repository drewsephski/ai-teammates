# Email cards in chat

Email requests acknowledge briefly before tool calls. The agent discovers a
current direct-send or thread-reply schema, reads the original message when
replying, then calls `executeAppTool` with `prepareOnly: true`. Supported
plain-text sends become editable Mail cards instead of prose. Preparation
stores the call in the existing approvals table; it does not call the mail
provider or create a provider draft. No schema push or new variables are needed.

Both clients load `emailDraft` from the owner-scoped approval endpoint. Save
persists edits; Send atomically persists edits and approves that exact call;
Discard denies it without requiring valid form fields. Revisions and a
compare-and-set on the saved arguments prevent a stale device from overwriting
or approving another device's edits. Reply identifiers and account bindings
remain server-controlled. Notifications and the existing approval API keep
working with the saved call.

The bot resumes through the existing `postChatMessage` path and runs
`runApprovedAction` once. Provider acceptance is shown as Sent; pending dispatch
is Queued to send. Failed or unknown outcomes never offer an automatic resend.
The existing worker must be running for a queued send to execute. Draft cards
expire after the existing seven-day approval TTL.

Gmail new emails and thread replies are supported. Schema-compatible Outlook
plain-text sends also work. Gmail reply tools inherit their subject, so that
field is read-only; recipients and body remain editable. HTML, attachments,
raw MIME, hidden extra recipients and incompatible schemas are rejected for
card preparation instead of hiding outgoing content from review.

Provider references: [Gmail tools](https://docs.composio.dev/toolkits/gmail),
[reply and send parameters](https://v3.docs.composio.dev/tools/gmail).
The complete schema loaded in the current turn remains authoritative.

Release order: deploy Railway and the Trigger.dev worker together, then release
the mobile client. The API and existing tool name are additive; older clients
continue to show a generic approval card. Historical prose drafts are not
converted into executable emails.
