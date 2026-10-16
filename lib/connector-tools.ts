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
export function createAppTools(userId: string, runtime: ConnectorRuntime) {
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
        "Run a tool whose full schema was loaded this turn through searchAppTools or getAppToolSchema. Match the schema exactly. Perform writes only when requested. Check status and provider data before claiming success. An unknown outcome must be verified with a read tool before retrying a write.",
      inputSchema: z.object({
        slug: slugSchema,
        arguments: z.record(z.string(), z.unknown()),
      }),
      execute: async ({ slug, arguments: input }, { abortSignal }) => {
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
        try {
          const result = await runtime.execute(
            userId,
            slug,
            input,
            account,
            abortSignal
          )
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
          return boundedResult({
            ...envelope,
            status,
            toolkit: entry.toolkit,
            accountId: account.id,
            ...(status !== "succeeded" && {
              message:
                status === "unknown"
                  ? "Outcome unconfirmed. Verify the external state with a read tool before retrying any write."
                  : "Execution failed. Inspect error and data; do not claim success or repeat unchanged arguments.",
            }),
          })
        } catch (error) {
          abortSignal?.throwIfAborted()
          // Transport exceptions can happen after the provider committed a write.
          // Do not expose raw SDK exceptions (which can include request secrets).
          const requiresInput =
            error instanceof Error &&
            error.name === "ComposioToolInputRequiredError"
          return boundedResult({
            status: requiresInput ? "requires_input" : "unknown",
            ...diagnosticIds(error),
            message: requiresInput
              ? "The provider requires user input or approval. The action is not confirmed; ask the user to resolve it."
              : "The provider did not return a confirmed outcome. Verify external state with a read tool before retrying any write. Do not switch sending methods.",
          })
        }
      },
    }),
  }
}

export type ConnectorTools = ReturnType<typeof createAppTools>
