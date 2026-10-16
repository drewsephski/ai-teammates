import { tool } from "ai"
import { z } from "zod"

export type AppAccount = { id: string; toolkit: string }
export type AppTool = {
  slug: string
  toolkit: string
  description: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
}
export type AppToolSearch = {
  tools: AppTool[]
  guidance: unknown
}
export type ConnectorRuntime = {
  accounts: (userId: string) => Promise<AppAccount[]>
  search: (
    query: string,
    accounts: AppAccount[],
    signal?: AbortSignal
  ) => Promise<AppToolSearch>
  schema: (
    slug: string,
    accounts: AppAccount[],
    signal?: AbortSignal
  ) => Promise<AppTool | undefined>
  execute: (
    userId: string,
    slug: string,
    input: Record<string, unknown>,
    account: AppAccount,
    signal?: AbortSignal
  ) => Promise<unknown>
}

// External writes wait for the owner. Reads, and actions the owner chose to
// always allow for this bot, run straight away.
export type ApprovalGate = {
  required: (tool: AppTool) => Promise<boolean>
  request: (call: {
    slug: string
    toolkit: string
    accountId: string
    input: Record<string, unknown>
    summary?: string
  }) => Promise<{ approvalId: string; summary: string }>
  // The approved call, once; undefined when it isn't approved for this bot
  claim: (approvalId: string) => Promise<
    | {
        slug: string
        toolkit: string
        accountId: string
        input: Record<string, unknown>
      }
    | undefined
  >
  complete: (
    approvalId: string,
    outcome: { ok: boolean; result: unknown }
  ) => Promise<void>
}

function boundedResult(value: unknown) {
  const text = JSON.stringify(value) ?? "null"
  const metadata =
    value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value).filter(([key]) =>
            [
              "status",
              "resultType",
              "error",
              "logId",
              "code",
              "message",
            ].includes(key)
          )
        )
      : {}
  return text.length <= 100_000
    ? text
    : JSON.stringify({
        ...metadata,
        truncated: true,
        preview: text.slice(0, 90_000),
        truncationMessage:
          "Result truncated. Narrow your query for the remaining data.",
      })
}

const slugSchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,199}$/)

function failure(code: string, message: string, extra = {}) {
  return boundedResult({ status: "failed", code, message, ...extra })
}

function diagnosticIds(error: unknown) {
  if (!error || typeof error !== "object") return {}
  return Object.fromEntries(
    Object.entries(error).filter(
      ([key, value]) =>
        ["requestId", "logId"].includes(key) &&
        typeof value === "string" &&
        /^[\w-]{1,200}$/.test(value)
    )
  )
}

// Provider filters are defense in depth. Enforce both discovery and execution
// locally, and re-check active ownership before every external action.
function executionStatus(result: unknown) {
  const envelope =
    result && typeof result === "object"
      ? (result as Record<string, unknown>)
      : {}
  const status =
    envelope.resultType === "completed" && !envelope.error
      ? "succeeded"
      : envelope.resultType === "failed" || envelope.error
        ? "failed"
        : "unknown"
  return { envelope, status }
}

function outcomeMessage(status: string) {
  return status === "unknown"
    ? "Outcome unconfirmed. Verify the external state with a read tool before retrying any write."
    : "Execution failed. Inspect error and data; do not claim success or repeat unchanged arguments."
}

function thrownOutcome(error: unknown) {
  // Transport exceptions can happen after the provider committed a write.
  // Do not expose raw SDK exceptions (which can include request secrets).
  const requiresInput =
    error instanceof Error && error.name === "ComposioToolInputRequiredError"
  return {
    status: requiresInput ? "requires_input" : "unknown",
    ...diagnosticIds(error),
    message: requiresInput
      ? "The provider requires user input or approval. The action is not confirmed; ask the user to resolve it."
      : "The provider did not return a confirmed outcome. Verify external state with a read tool before retrying any write. Do not switch sending methods.",
  }
}

export function createAppTools(
  userId: string,
  runtime: ConnectorRuntime,
  gate?: ApprovalGate
) {
  const discovered = new Map<string, { tool: AppTool; accountId: string }>()
  function remember(entry: AppTool, accounts: AppAccount[]) {
    const account = accounts.find((a) => a.toolkit === entry.toolkit)
    if (entry.inputSchema && account)
      discovered.set(entry.slug, { tool: entry, accountId: account.id })
  }
  return {
    searchAppTools: tool({
      description:
        "Discover connected-app tools for a complete workflow in plain English, including prerequisites. Returns exact schemas, recommended steps and known pitfalls. Follow that guidance. For a known slug from earlier conversation use getAppToolSchema instead. Search results may be partial; a missing result does not prove an operation is unavailable.",
      inputSchema: z.object({ query: z.string().trim().min(1).max(500) }),
      execute: async ({ query }, { abortSignal }) => {
        const accounts = await runtime.accounts(userId)
        const allowed = new Set(accounts.map((account) => account.toolkit))
        if (!allowed.size)
          return boundedResult({
            tools: [],
            connectedApps: [],
            message:
              "No apps connected. Open Apps for a supported integration, or use the official website for browser-based work if computer tools are available.",
          })
        let results: AppToolSearch
        try {
          results = await runtime.search(query, accounts, abortSignal)
        } catch (error) {
          abortSignal?.throwIfAborted()
          return failure(
            "DISCOVERY_FAILED",
            "Connected-app discovery failed. No action was executed. Retry discovery before deciding an app or tool is unavailable.",
            diagnosticIds(error)
          )
        }
        let tools = results.tools.filter((entry) => allowed.has(entry.toolkit))
        // Never cut a schema in half or authorize an unseen schema. Large
        // searches return summaries; exact lookup supplies one complete schema.
        if (JSON.stringify(tools).length > 70_000)
          tools = tools.map(({ slug, toolkit, description }) => ({
            slug,
            toolkit,
            description,
          }))
        for (const entry of tools) remember(entry, accounts)
        return boundedResult({
          tools,
          connectedApps: [...allowed],
          guidance:
            JSON.stringify(results.guidance ?? null).length <= 20_000
              ? results.guidance
              : {
                  message:
                    "Workflow guidance is too large. Narrow the search for specific steps.",
                },
          message: tools.length
            ? "Use exact schemas with executeAppTool. If inputSchema is absent, call getAppToolSchema first."
            : "No matching tools in your connected apps. Refine the search if useful. For a browser-based task, use the official website if computer tools are available; a missing connector does not make the website unavailable.",
        })
      },
    }),
    getAppToolSchema: tool({
      description:
        "Retrieve the current full input and output schema for an exact tool slug from discovery or conversation history. Use on continuation/approval turns, for related tools, missing schemas, or to repair arguments. This only reads a schema; it never performs the action. Never guess slugs.",
      inputSchema: z.object({ slug: slugSchema }),
      execute: async ({ slug }, { abortSignal }) => {
        discovered.delete(slug)
        const accounts = await runtime.accounts(userId)
        let entry: AppTool | undefined
        try {
          entry = await runtime.schema(slug, accounts, abortSignal)
        } catch (error) {
          abortSignal?.throwIfAborted()
          return failure(
            "SCHEMA_LOOKUP_FAILED",
            "The schema lookup failed. No action was executed. Retry lookup or refine discovery; this does not prove the tool is unavailable.",
            diagnosticIds(error)
          )
        }
        if (!entry || !accounts.some((a) => a.toolkit === entry.toolkit))
          return failure(
            "TOOL_NOT_AVAILABLE",
            "Tool not found in connected apps. Refine searchAppTools or reconnect the app in Apps."
          )
        if (!entry.inputSchema || JSON.stringify(entry).length > 70_000)
          return failure(
            "SCHEMA_UNAVAILABLE",
            "A complete usable schema was not returned. Do not execute this tool."
          )
        remember(entry, accounts)
        return boundedResult({ tool: entry })
      },
    }),
    executeAppTool: tool({
      description:
        "Run a tool whose full schema was loaded this turn through searchAppTools or getAppToolSchema. Match the schema exactly. Perform writes only when requested. Writes such as sending, posting, creating or deleting may return approval_required: Krafty then shows the owner an approval card and notifies their phone, so don't ask for confirmation in text first. Check status and provider data before claiming success. An unknown outcome must be verified with a read tool before retrying a write.",
      inputSchema: z.object({
        slug: slugSchema,
        arguments: z.record(z.string(), z.unknown()),
        summary: z
          .string()
          .trim()
          .max(300)
          .optional()
          .describe(
            "For writes: one plain sentence the owner reads on the approval card, naming the recipient or target and the gist, e.g. 'Email Sam Lee the Q3 summary'."
          ),
      }),
      execute: async ({ slug, arguments: input, summary }, { abortSignal }) => {
        const loaded = discovered.get(slug)
        const entry = loaded?.tool
        if (!entry?.inputSchema)
          return failure(
            "SCHEMA_REQUIRED",
            "Load the full schema with getAppToolSchema (for a known slug) or searchAppTools before executing. This attempt did not run."
          )
        const account = (await runtime.accounts(userId)).find(
          (account) => account.toolkit === entry.toolkit
        )
        if (!account)
          return failure(
            "APP_DISCONNECTED",
            "This app is no longer connected. Reconnect it in Apps. This attempt did not run."
          )
        if (account.id !== loaded?.accountId)
          return failure(
            "ACCOUNT_CHANGED",
            "The connected account changed. Reload the schema and verify the intended account before executing. This attempt did not run."
          )
        let validation: z.ZodSafeParseResult<unknown>
        try {
          validation = z.fromJSONSchema(entry.inputSchema).safeParse(input)
        } catch {
          return failure(
            "SCHEMA_UNSUPPORTED",
            "The tool schema could not be validated. Refresh it with getAppToolSchema; do not guess arguments. This attempt did not run."
          )
        }
        if (!validation.success)
          return failure(
            "INVALID_ARGUMENTS",
            "Arguments do not match the current schema. Correct these fields before retrying. This attempt did not run.",
            {
              issues: validation.error.issues.map(({ path, message }) => ({
                path,
                message,
              })),
            }
          )
        abortSignal?.throwIfAborted()
        if (gate && (await gate.required(entry))) {
          const held = await gate.request({
            slug,
            toolkit: entry.toolkit,
            accountId: account.id,
            input,
            summary,
          })
          return boundedResult({
            status: "approval_required",
            approvalId: held.approvalId,
            summary: held.summary,
            toolkit: entry.toolkit,
            message:
              "Nothing was executed. The owner has an approval card and a notification. Tell them in one sentence what you'll do once they approve, then stop. Don't retry, rephrase, or work around this; you'll get a message when they decide.",
          })
        }
        try {
          const result = await runtime.execute(
            userId,
            slug,
            input,
            account,
            abortSignal
          )
          const { envelope, status } = executionStatus(result)
          return boundedResult({
            ...envelope,
            status,
            toolkit: entry.toolkit,
            accountId: account.id,
            ...(status !== "succeeded" && { message: outcomeMessage(status) }),
          })
        } catch (error) {
          abortSignal?.throwIfAborted()
          return boundedResult(thrownOutcome(error))
        }
      },
    }),
    runApprovedAction: tool({
      description:
        "Run an action the owner approved, by the approvalId from their approval message. Runs exactly the call they saw, once. Check the result before reporting success.",
      inputSchema: z.object({ approvalId: z.string().min(1).max(100) }),
      execute: async ({ approvalId }, { abortSignal }) => {
        if (!gate)
          return failure(
            "APPROVALS_UNAVAILABLE",
            "Approved actions can't run in this chat."
          )
        const call = await gate.claim(approvalId)
        if (!call)
          return failure(
            "NOT_APPROVED",
            "That request isn't approved for you, or it already ran. Don't retry; tell the owner what happened."
          )
        // Claimed: from here every path records an outcome, so the approval
        // never reads as done when nothing ran
        try {
          const account = (await runtime.accounts(userId)).find(
            (account) => account.toolkit === call.toolkit
          )
          if (!account || account.id !== call.accountId) {
            const result = {
              status: "failed",
              code: "ACCOUNT_CHANGED",
              message:
                "The connected account changed since approval. Nothing ran. Ask the owner to reconnect the app, then request approval again.",
            }
            await gate.complete(approvalId, { ok: false, result })
            return boundedResult(result)
          }
          const result = await runtime.execute(
            userId,
            call.slug,
            call.input,
            account,
            abortSignal
          )
          const { envelope, status } = executionStatus(result)
          await gate.complete(approvalId, {
            ok: status === "succeeded",
            result: { status },
          })
          return boundedResult({
            ...envelope,
            status,
            toolkit: call.toolkit,
            accountId: account.id,
            ...(status !== "succeeded" && { message: outcomeMessage(status) }),
          })
        } catch (error) {
          const outcome = thrownOutcome(error)
          await gate
            .complete(approvalId, { ok: false, result: outcome })
            .catch(() => {})
          return boundedResult(outcome)
        }
      },
    }),
  }
}

export type ConnectorTools = ReturnType<typeof createAppTools>
