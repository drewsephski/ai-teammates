# Trigger.dev support question — sent October 16, 2026

The owner approved sending this technical inquiry through the Trigger.dev MCP
feedback tool. The tool confirmed receipt. No provider answer or erasure process
has been received yet.

Subject: Supported erasure of chat.agent session data for end-user account deletion

We run an app using @trigger.dev/sdk 4.7.4 and chat.agent's default transcript
storage. Each conversation has an application-owned external session ID.

We are implementing account deletion. Our server can close each owned session
and remove its corresponding database records. The installed sessions API
exposes start/retrieve/update/close/list/open, but no deletion operation.

What is the supported way to erase all data belonging to selected sessions,
including the transcript snapshot and state, reserved input/output streams,
named channels, cached payloads, and associated run inputs/outputs?

Please clarify:

1. Is there a supported API or dashboard operation that erases those records?
2. Does closing a session start any automatic deletion or object-store expiry?
3. What retention remains after erasure, including backups, and what is the
   documented completion timeframe?
4. If erasure currently requires a support request, what identifiers should
   an application retain so a request can be fulfilled after its user is deleted?

No credentials, real conversation content, user identifiers, or deletion request
are included in this technical inquiry. It does not request erasure of any data.
