import { tool } from "ai"
import { z } from "zod"
import { emailContextSchema, stageEmailDraft } from "@/lib/email-draft"
import {
  ambiguousToolkits,
  selectAccount,
} from "@/lib/connector-account-policy"
import {
  CONNECTION_EXPIRED_MESSAGE,
  INSUFFICIENT_PERMISSIONS_MESSAGE,
  UNKNOWN_OUTCOME_MESSAGE,
  classifyEnvelope,
  classifyThrown,
  type ConnectorFailure,
} from "@/lib/connector-failure-policy"
import {
  accountExpired,
  expiredToolkits,
  flagAccountRejected,
} from "@/lib/connection-health"
import { zonedParts } from "@/lib/routine-policy"
import {
  DEFAULT_STALE_DAYS,
  quoteSheet,
  reviewTracker as reviewTrackerValues,
  spreadsheetIdFrom,
  trackerRoles,
} from "@/lib/tracker-review"

// `label` and `connectedAt` only help the person tell two accounts apart
export type AppAccount = {
  id: string
  toolkit: string
  label?: string
  connectedAt?: string
}
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
  required: (tool: AppTool, accountId: string) => Promise<boolean>
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
  // Whether this email goes only to the owner, so it can send without a card
  sendsToOwner?: (
    tool: AppTool,
    input: Record<string, unknown>
  ) => Promise<boolean>
}

type ClaimedCall = NonNullable<Awaited<ReturnType<ApprovalGate["claim"]>>>

// Runs a claimed approval's stored call and records how it went. From the
// claim on, every path records an outcome, so the approval never reads as
// done when nothing ran. Used by runApprovedAction and by Krafty itself when
// the owner approves (lib/approvals.ts).
export async function runClaimedCall(
  userId: string,
  runtime: Pick<ConnectorRuntime, "accounts" | "execute">,
  complete: ApprovalGate["complete"],
  approvalId: string,
  call: ClaimedCall,
  abortSignal?: AbortSignal
): Promise<{ ok: boolean; result: unknown }> {
  try {
    const account = (await runtime.accounts(userId)).find(
      (account) =>
        account.toolkit === call.toolkit && account.id === call.accountId
    )
    if (!account) {
      const result = {
        status: "failed",
        code: "ACCOUNT_CHANGED",
        message:
          "The connected account changed since approval. Nothing ran. Ask the owner to reconnect the app, then request approval again.",
      }
      await complete(approvalId, { ok: false, result })
      return { ok: false, result }
    }
    const result = await runtime.execute(
      userId,
      call.slug,
      call.input,
      account,
      abortSignal
    )
    const described = describeResult(userId, call.toolkit, account.id, result)
    await complete(approvalId, {
      ok: described.ok,
      result: { status: described.value.status },
    })
    return { ok: described.ok, result: described.value }
  } catch (error) {
    const outcome = thrownOutcome(userId, call.toolkit, call.accountId, error)
    await complete(approvalId, { ok: false, result: outcome }).catch(() => {})
    return { ok: false, result: outcome }
  }
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

// What the model is told about a finished or failed execution. Auth failures
// become a reconnect hand-off; provider outages become an unknown outcome.
function failureFields(
  userId: string,
  toolkit: string,
  accountId: string,
  failure: ConnectorFailure
): Record<string, unknown> | undefined {
  if (failure === "connection_expired") {
    flagAccountRejected(userId, toolkit, accountId, "expired")
    return {
      status: "failed",
      code: "CONNECTION_EXPIRED",
      reconnect: { toolkit },
      message: CONNECTION_EXPIRED_MESSAGE,
    }
  }
  if (failure === "insufficient_permissions") {
    // The account keeps working for what it may do; only the offer changes
    flagAccountRejected(userId, toolkit, accountId, "insufficient")
    return {
      status: "failed",
      code: "INSUFFICIENT_PERMISSIONS",
      reconnect: { toolkit },
      message: INSUFFICIENT_PERMISSIONS_MESSAGE,
    }
  }
  if (failure === "unknown_outcome")
    return {
      status: "unknown",
      code: "OUTCOME_UNKNOWN",
      message: UNKNOWN_OUTCOME_MESSAGE,
    }
  return undefined
}

function describeResult(
  userId: string,
  toolkit: string,
  accountId: string,
  result: unknown
) {
  const { envelope, status } = executionStatus(result)
  const fields =
    status === "succeeded"
      ? undefined
      : failureFields(userId, toolkit, accountId, classifyEnvelope(envelope))
  return {
    ok: status === "succeeded",
    value: {
      ...envelope,
      status,
      toolkit,
      accountId,
      ...(status !== "succeeded" && {
        ...(status === "unknown" && { code: "OUTCOME_UNKNOWN" }),
        message: outcomeMessage(status),
        ...fields,
      }),
    },
  }
}

function thrownOutcome(
  userId: string,
  toolkit: string,
  accountId: string,
  error: unknown
) {
  // Transport exceptions can happen after the provider committed a write.
  // Do not expose raw SDK exceptions (which can include request secrets).
  const requiresInput =
    error instanceof Error && error.name === "ComposioToolInputRequiredError"
  if (requiresInput)
    return {
      status: "requires_input",
      ...diagnosticIds(error),
      message:
        "The provider requires user input or approval. The action is not confirmed; ask the user to resolve it.",
    }
  const failure = classifyThrown(error)
  return {
    // A rejected credential never reached the action; anything else may have
    status: "unknown",
    code: "OUTCOME_UNKNOWN",
    ...diagnosticIds(error),
    message:
      "The provider did not return a confirmed outcome. Verify external state with a read tool before retrying any write. Do not switch sending methods.",
    ...failureFields(userId, toolkit, accountId, failure),
  }
}

// The read reviewTracker runs: the whole tab, unformatted, so real date cells
// arrive as serial numbers whatever the sheet's locale
export const TRACKER_READ_SLUG = "GOOGLESHEETS_BATCH_GET"
const TRACKER_TOOLKIT = "googlesheets"

// The values and A1 range of a Sheets read, in either of Composio's shapes
function sheetValues(data: unknown) {
  const record =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {}
  const ranges = (record.valueRanges ?? record.value_ranges) as
    { range?: unknown; values?: unknown }[] | undefined
  const first = Array.isArray(ranges) ? ranges[0] : record
  const values = first?.values
  return {
    range: typeof first?.range === "string" ? first.range : undefined,
    values: Array.isArray(values)
      ? values.map((row) => (Array.isArray(row) ? (row as unknown[]) : []))
      : [],
  }
}

function localDate(timeZone: string, now: Date) {
  const p = zonedParts(now, timeZone)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

export function createAppTools(
  userId: string,
  runtime: ConnectorRuntime,
  gate?: ApprovalGate,
  options: {
    // The owner's saved timezone, for "today" in a tracker review
    timeZone?: () => Promise<string | null | undefined>
    now?: () => Date
  } = {}
) {
  // The accounts each schema was loaded under, so a replaced account is caught
  const discovered = new Map<string, { tool: AppTool; accountIds: string[] }>()
  function remember(entry: AppTool, accounts: AppAccount[]) {
    const ids = accounts
      .filter((a) => a.toolkit === entry.toolkit)
      .map((a) => a.id)
    if (entry.inputSchema && ids.length)
      discovered.set(entry.slug, { tool: entry, accountIds: ids })
  }
  // Which of the person's accounts a call runs as, or the answer to give when
  // none can: expired, disconnected, or a choice they have to make
  async function chooseAccount(toolkit: string, requestedAccountId?: string) {
    const expired = (accountId?: string) =>
      boundedResult({
        status: "failed",
        code: "CONNECTION_EXPIRED",
        toolkit,
        ...(accountId && { accountId }),
        reconnect: { toolkit },
        message: CONNECTION_EXPIRED_MESSAGE,
      })
    // Only the account that was rejected: the person's other accounts for
    // this app stay usable
    if (requestedAccountId && accountExpired(userId, requestedAccountId))
      return { reply: expired(requestedAccountId) }
    const selection = selectAccount(
      await runtime.accounts(userId),
      toolkit,
      requestedAccountId
    )
    if (!selection.ok && selection.reason === "none")
      return {
        reply: expiredToolkits(userId).has(toolkit)
          ? expired()
          : failure(
              "APP_DISCONNECTED",
              "This app is no longer connected. Call findApps and show a connect card, or tell the person to reconnect it in Apps. This attempt did not run."
            ),
      }
    if (!selection.ok)
      return {
        reply: boundedResult({
          status: "requires_input",
          code:
            selection.reason === "unknown"
              ? "ACCOUNT_NOT_FOUND"
              : "ACCOUNT_CHOICE_REQUIRED",
          toolkit,
          accounts: selection.choices,
          message:
            selection.reason === "unknown"
              ? "That accountId isn't one of the person's connected accounts for this app. This attempt did not run. Ask which account to use with askUser, naming the accounts by label, then call again with the accountId."
              : "The person has more than one account connected for this app, so nothing ran. Ask which one to use with askUser, naming the accounts by label (and connectedAt if labels are missing), then call again with that accountId. Never pick one yourself.",
        }),
      }
    if (accountExpired(userId, selection.account.id))
      return { reply: expired(selection.account.id) }
    return { account: selection.account }
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
              "No apps connected. Call findApps to see whether an integration exists and can be connected from a card, or use the official website for browser-based work if computer tools are available.",
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
        const choices = ambiguousToolkits(accounts)
        return boundedResult({
          tools,
          connectedApps: [...allowed],
          // Only when a toolkit has two or more accounts: executeAppTool then
          // needs the person's pick, passed as accountId
          ...(choices.length && { accountsToChoose: choices }),
          guidance:
            JSON.stringify(results.guidance ?? null).length <= 20_000
              ? results.guidance
              : {
                  message:
                    "Workflow guidance is too large. Narrow the search for specific steps.",
                },
          message: tools.length
            ? "Use exact schemas with executeAppTool. If inputSchema is absent, call getAppToolSchema first."
            : "No matching tools in your connected apps. One narrow search proves nothing: refine it with different words (the action, the object, the service) before concluding. If the connector still lacks the action, use the official website if computer tools are available; a missing connector does not make the website unavailable.",
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
            "Tool not found in connected apps. That doesn't prove the app can't do it: refine searchAppTools with different words, or use the computer if it's available. If the app might be disconnected, call findApps to check."
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
        "Run a tool whose full schema was loaded this turn through searchAppTools or getAppToolSchema. Match the schema exactly. Perform writes only when requested. Writes such as sending, posting, creating or deleting may return approval_required: Krafty then shows the owner an approval card and notifies their phone, so don't ask for confirmation in text first. Check status and provider data before claiming success. An unknown outcome must be verified with a read tool before retrying a write. If the person has more than one account for the app, this returns status=requires_input with the accounts: ask which one with askUser, then call again with that accountId.",
      inputSchema: z.object({
        slug: slugSchema,
        arguments: z.record(z.string(), z.unknown()),
        accountId: z
          .string()
          .min(1)
          .max(200)
          .optional()
          .describe(
            "Which connected account to use, from a requires_input result's accounts. Omit it when the app has one account."
          ),
        prepareOnly: z
          .boolean()
          .optional()
          .describe(
            "For email drafts: true stages an editable email card without sending or creating a provider draft. Load a direct-send or thread-reply schema first."
          ),
        emailContext: emailContextSchema.optional(),
        summary: z
          .string()
          .trim()
          .max(300)
          .optional()
          .describe(
            "For writes: one plain sentence the owner reads on the approval card, naming the recipient or target and the gist, e.g. 'Email Sam Lee the Q3 summary'."
          ),
      }),
      execute: async (
        {
          slug,
          arguments: input,
          summary,
          prepareOnly,
          emailContext,
          accountId: requestedAccountId,
        },
        { abortSignal }
      ) => {
        const loaded = discovered.get(slug)
        const entry = loaded?.tool
        if (!entry?.inputSchema)
          return failure(
            "SCHEMA_REQUIRED",
            "Load the full schema with getAppToolSchema (for a known slug) or searchAppTools before executing. This attempt did not run."
          )
        const chosen = await chooseAccount(entry.toolkit, requestedAccountId)
        if (!chosen.account) return chosen.reply
        const account = chosen.account
        if (!requestedAccountId && !loaded?.accountIds.includes(account.id))
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
        let email: Record<string, unknown> | undefined
        try {
          email = stageEmailDraft(entry, input, emailContext)
        } catch {
          return failure(
            "INVALID_ARGUMENTS",
            "Use valid email recipients, a subject and a plain-text body. Nothing was sent."
          )
        }
        if (prepareOnly && !email)
          return failure(
            "EMAIL_CARD_UNSUPPORTED",
            "This schema cannot be safely edited in an email card. Load a plain-text direct-send or thread-reply email schema. Nothing was sent."
          )
        if ((email || prepareOnly) && !gate)
          return failure(
            "APPROVALS_UNAVAILABLE",
            "Email review is unavailable in this chat. Nothing was sent."
          )
        // Mail only to the owner's own verified addresses sends straight away
        const toOwner =
          !prepareOnly &&
          !!email &&
          !!gate?.sendsToOwner &&
          (await gate.sendsToOwner(entry, input))
        if (
          gate &&
          !toOwner &&
          (email || (await gate.required(entry, account.id)))
        ) {
          const held = await gate.request({
            slug,
            toolkit: entry.toolkit,
            accountId: account.id,
            input: email ?? input,
            summary,
          })
          return boundedResult({
            status: "approval_required",
            approvalId: held.approvalId,
            summary: held.summary,
            toolkit: entry.toolkit,
            message:
              "Nothing was executed. The owner has an approval card and a notification. If the task needs more actions like this one (for example one email per client), prepare each of them now the same way: the owner decides them together and you get one message when they have. Then tell them in one or two sentences what will happen once they approve, and stop. Don't retry, rephrase, or work around this one.",
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
          return boundedResult(
            describeResult(userId, entry.toolkit, account.id, result).value
          )
        } catch (error) {
          abortSignal?.throwIfAborted()
          return boundedResult(
            thrownOutcome(userId, entry.toolkit, account.id, error)
          )
        }
      },
    }),
    reviewTracker: tool({
      description:
        "Review a project tracker in Google Sheets, read-only. It reads one tab, works out which columns hold the task, owner, status, due date, last update and blocker, and lists every unfinished task that is overdue, blocked, or hasn't been updated in staleDays, judged on the person's local date. Each row comes with the sheet's own row number and the A1 address of its cells. Use it for any tracker or task-list review instead of reading the cells and counting rows yourself, and pass find with task names to get a task's row, current values and cells: before changing it, and again afterwards to read the change back. Report what it returns: cite its row numbers as given, don't add or drop flagged rows, and ask the person about each item in unsure before relying on that part.",
      inputSchema: z.object({
        spreadsheet: z
          .string()
          .trim()
          .min(1)
          .max(500)
          .describe("The spreadsheet's Google Sheets link or ID"),
        sheet: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .optional()
          .describe("The tab's name. Omit it for the first tab."),
        columns: z
          .object(
            Object.fromEntries(
              trackerRoles.map((role) => [
                role,
                z.string().trim().min(1).max(100).optional(),
              ])
            ) as Record<
              (typeof trackerRoles)[number],
              z.ZodOptional<z.ZodString>
            >
          )
          .optional()
          .describe(
            "Only columns the person named because the guess was wrong or unsure. Prefer the header text: letters shift when someone inserts a column."
          ),
        staleDays: z
          .number()
          .int()
          .min(1)
          .max(90)
          .optional()
          .describe(
            `Days without an update that make a task stale. Default ${DEFAULT_STALE_DAYS}.`
          ),
        find: z
          .array(z.string().trim().min(1).max(200))
          .max(10)
          .optional()
          .describe("Task names to locate, for the row and cells of each"),
        accountId: z
          .string()
          .min(1)
          .max(200)
          .optional()
          .describe(
            "Which connected Google Sheets account, from a requires_input result's accounts. Omit it when there is one."
          ),
      }),
      execute: async (
        { spreadsheet, sheet, columns, staleDays, find, accountId },
        { abortSignal }
      ) => {
        const spreadsheetId = spreadsheetIdFrom(spreadsheet)
        if (!spreadsheetId)
          return failure(
            "SPREADSHEET_ID_REQUIRED",
            "Pass the spreadsheet's link (docs.google.com/spreadsheets/d/...) or its ID. A published-to-web link or a name won't work: find the sheet with searchAppTools or ask the person for its link. Nothing was read."
          )
        const chosen = await chooseAccount(TRACKER_TOOLKIT, accountId)
        if (!chosen.account) return chosen.reply
        const account = chosen.account
        const zone = (await options.timeZone?.()) || undefined
        const today = localDate(zone ?? "UTC", options.now?.() ?? new Date())
        // A reconnect or permission problem keeps its own instructions (a
        // card for the person); anything else is a read that changed nothing
        const readFailed = (fields: Record<string, unknown>) =>
          boundedResult(
            fields.reconnect
              ? { ...fields, status: "failed" }
              : {
                  status: "failed",
                  code: "READ_FAILED",
                  toolkit: TRACKER_TOOLKIT,
                  ...(typeof fields.error === "string" && {
                    error: fields.error.slice(0, 300),
                  }),
                  ...(typeof fields.logId === "string" && {
                    logId: fields.logId,
                  }),
                  message:
                    "Reading the sheet failed; nothing was changed. Check the link and the tab name. If the sheet isn't shared with the connected Google account, ask the person to share it or to reconnect with the account that can open it. Retry at most once.",
                }
          )
        let result: unknown
        try {
          result = await runtime.execute(
            userId,
            TRACKER_READ_SLUG,
            {
              spreadsheet_id: spreadsheetId,
              ...(sheet && { ranges: [quoteSheet(sheet)] }),
              majorDimension: "ROWS",
              valueRenderOption: "UNFORMATTED_VALUE",
              dateTimeRenderOption: "SERIAL_NUMBER",
            },
            account,
            abortSignal
          )
        } catch (error) {
          abortSignal?.throwIfAborted()
          return readFailed(
            thrownOutcome(userId, TRACKER_TOOLKIT, account.id, error)
          )
        }
        const described = describeResult(
          userId,
          TRACKER_TOOLKIT,
          account.id,
          result
        )
        if (!described.ok) return readFailed(described.value)
        const { range, values } = sheetValues(
          (result as Record<string, unknown>).data
        )
        const review = reviewTrackerValues(values, {
          today,
          range: range ?? (sheet ? `${quoteSheet(sheet)}!A1` : undefined),
          staleDays,
          columns,
          find,
        })
        return boundedResult({
          status: "succeeded",
          spreadsheetId,
          ...review,
          ...(!zone && {
            timezoneNote:
              "The person's timezone isn't set, so today is the UTC date.",
          }),
          ...(review.rowLimitReached && {
            rowLimitNote:
              "Only the first 5,000 rows were reviewed. Say so in the report.",
          }),
          message:
            "These are the sheet's own row numbers and cell addresses; cite them exactly. Every unfinished task that is overdue, blocked or stale is in flagged (unless flaggedOmitted says more were cut). Ask about each unsure item before relying on that part. To change a task, write only its listed cells.",
        })
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
        return boundedResult(
          (
            await runClaimedCall(
              userId,
              runtime,
              gate.complete,
              approvalId,
              call,
              abortSignal
            )
          ).result
        )
      },
    }),
  }
}

export type ConnectorTools = ReturnType<typeof createAppTools>
