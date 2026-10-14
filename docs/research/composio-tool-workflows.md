# Reliable connected-app workflows

Research and verification: October 13, 2026. Installed SDK: `@composio/core` 0.23.0.

Composio recommends sessions for general agents. Session search returns relevant
schemas plus recommended workflow steps, known pitfalls and prerequisites. A raw
catalog search gives tool definitions without this workflow context. Search is
ranked discovery, not a complete capability inventory. Related tools may need a
separate exact schema lookup.

Sources consulted:

- [Session concepts and execution](https://docs.composio.dev/docs/how-composio-works)
- [Session configuration and account bindings](https://docs.composio.dev/docs/configuring-sessions)
- [Search Tools: workflow guidance and partial schemas](https://docs.composio.dev/toolkits/meta-tools/search_tools)
- [Get Tool Schemas: exact lookup](https://docs.composio.dev/toolkits/meta-tools/get_tool_schemas)
- [Gmail toolkit](https://docs.composio.dev/toolkits/gmail)
- Installed SDK source: `src/models/ToolRouterSession.ts`,
  `src/types/toolRouter.types.ts`, and `src/utils/transformers/toolRouterResponseTransform.ts`.

## Application changes

`createSessionRuntime` shares a scoped session across discovery, schema retrieval
and execution within a worker turn. It pins one owned active account per toolkit,
normalizes toolkit casing, forwards cancellation, and rechecks account selection
before execution. Composio's SDK disables transport retries on `session.execute`.
The existing Apps connection UI and plan restrictions remain the authority.

The chat worker deliberately exits after every turn. Instead of persisting a
Composio session with potentially stale account bindings, a subsequent turn uses
`getAppToolSchema` to reload an exact slug from the transcript. This addresses the
approval-turn failure: an old transcript schema cannot authorize execution in a
fresh worker, and repeating a fuzzy search may miss the exact tool.

`createAppTools` validates arguments against the loaded JSON schema using Zod 4
before executing. It rejects missing/incomplete schemas, wrong argument types and
account changes. Oversized schemas are never partially exposed or authorized.
Unsupported schemas fail closed. Provider-specific constraints described only in
prose still require model interpretation and provider validation.

The shared prompt teaches workflow discovery for every connected service, actual
resource-ID chaining, and explicit email semantics: draft-only, direct send, or
send the existing approved draft. Draft creation and mailbox insertion do not
establish sending. An ambiguous send outcome requires a read to verify state
before another write. Structured outcomes and diagnostic IDs are available to the
agent and displayed as failures when appropriate. Raw SDK exceptions are withheld.

This is not durable exactly-once delivery: a timeout or worker crash may happen
after a provider commits a write. The agent must verify external state before a
retry. We do not claim recipient delivery from provider acceptance alone.

## Verification

- Read-only live session discovery found `GMAIL_SEND_EMAIL`,
  `GMAIL_CREATE_EMAIL_DRAFT`, and `GMAIL_SEND_DRAFT` with full schemas. Exact schema
  retrieval returned both input and output schemas. It confirmed uppercase
  toolkit labels and the difference between draft IDs and message IDs.
- The production connector factory successfully discovered Gmail profile tools,
  loaded the exact profile schema, executed `GMAIL_GET_PROFILE` as a live read,
  and loaded the direct-send input/output schemas without sending mail.
- Unit tests cover isolation, disconnects/downgrades, cancellation, session reuse,
  casing, partial schemas, validation, approval-turn lookup, account replacement,
  failed results with null errors, ambiguous transport outcomes and bounded JSON.
- `pnpm exec tsx --env-file=.env.local scripts/verify-connector-agent.ts` runs the
  real application model against current catalog schemas and simulated execution.
  It verifies new mail sends once, draft-only never sends, approval sends the
  existing draft, a draft-then-send fallback uses the newly returned draft ID, and
  an uncertain send is checked with a read instead of repeated.
  It does not invoke provider execution or send real email. It incurs model usage.

Release requires deploying the Trigger.dev chat worker and Railway app together;
the frontend understands the new schema tool and structured failures. No new
environment variables or database changes are required.
