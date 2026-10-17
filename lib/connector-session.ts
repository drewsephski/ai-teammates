import type { ToolRouterSessionSearchResponse } from "@composio/core"
import { z } from "zod"
import type { AppAccount, AppTool, ConnectorRuntime } from "./connector-tools"

type Session = {
  search: (
    params: { query: string; toolkits: string[] },
    options?: { signal?: AbortSignal }
  ) => Promise<ToolRouterSessionSearchResponse>
  execute: (
    slug: string,
    input: Record<string, unknown>,
    options?: undefined,
    requestOptions?: { signal?: AbortSignal }
  ) => Promise<unknown>
}

type SessionFactory = (
  userId: string,
  toolkits: string[],
  connectedAccounts: Record<string, string[]>
) => Promise<Session>

const schemaResponse = z.object({
  data: z.object({
    tool_schemas: z.record(
      z.string(),
      z.object({
        toolkit: z.string(),
        description: z.string().optional(),
        input_schema: z.record(z.string(), z.unknown()).optional(),
        output_schema: z.record(z.string(), z.unknown()).optional(),
      })
    ),
  }),
  resultType: z.literal("completed"),
  error: z.null().optional(),
})

// A worker lasts one turn. Share scoped sessions within that turn so search,
// schema lookup and execution see the same toolkit versions and account bindings.
export function createSessionRuntime(
  userId: string,
  accounts: ConnectorRuntime["accounts"],
  createSession: SessionFactory,
  options: { readOnly?: boolean } = {}
): ConnectorRuntime {
  const sessions = new Map<string, Promise<Session>>()
  function sessionFor(owned: AppAccount[], chosen?: AppAccount) {
    const bindings: Record<string, string[]> = {}
    // Discovery sees one account per toolkit. Execution is pinned to the account
    // the call chose, so the provider never picks one and a second account is
    // never exposed by accident.
    if (chosen) bindings[chosen.toolkit] = [chosen.id]
    for (const account of owned) bindings[account.toolkit] ??= [account.id]
    const key = JSON.stringify(bindings)
    let session = sessions.get(key)
    if (!session) {
      session = createSession(userId, Object.keys(bindings), bindings)
      sessions.set(key, session)
      void session.catch(() => sessions.delete(key))
    }
    return session
  }
  return {
    accounts,
    search: async (query, owned, signal) => {
      signal?.throwIfAborted()
      const session = await sessionFor(owned)
      signal?.throwIfAborted()
      const result = await session.search(
        {
          query,
          toolkits: [...new Set(owned.map((a) => a.toolkit))],
        },
        { signal }
      )
      return {
        tools: Object.values(result.toolSchemas).map((entry): AppTool => ({
          slug: entry.toolSlug,
          toolkit: entry.toolkit.toLowerCase(),
          description: entry.description ?? entry.toolSlug,
          ...(entry.hasFullSchema !== false && {
            inputSchema: entry.inputSchema,
          }),
          outputSchema: entry.outputSchema,
        })),
        guidance: {
          success: result.success,
          error: result.error,
          workflows: result.results,
          nextSteps: result.nextStepsGuidance,
          timeInfo: result.timeInfo,
        },
      }
    },
    schema: async (slug, owned, signal) => {
      if (!owned.length) return undefined
      signal?.throwIfAborted()
      const session = await sessionFor(owned)
      signal?.throwIfAborted()
      const result = schemaResponse.safeParse(
        await session.execute(
          "COMPOSIO_GET_TOOL_SCHEMAS",
          { tool_slugs: [slug], include: ["input_schema", "output_schema"] },
          undefined,
          { signal }
        )
      )
      if (!result.success) return undefined
      const entry = result.data.data.tool_schemas[slug]
      return (
        entry && {
          slug,
          toolkit: entry.toolkit.toLowerCase(),
          description: entry.description ?? slug,
          inputSchema: entry.input_schema,
          outputSchema: entry.output_schema,
        }
      )
    },
    execute: async (owner, slug, input, account, signal) => {
      if (owner !== userId) throw new Error("Connected app owner mismatch")
      function marksRead(value: unknown): boolean {
        if (!value || typeof value !== "object") return false
        return Object.entries(value).some(
          ([key, nested]) =>
            (/^mark(?:as)?(?:read|seen)$/i.test(key.replace(/_/g, "")) &&
              (nested === true || nested === "true" || nested === 1)) ||
            marksRead(nested)
        )
      }
      if (options.readOnly && marksRead(input))
        throw new Error("Read-only discovery cannot mark records as read")
      const owned = await accounts(userId)
      if (
        !owned.some((a) => a.toolkit === account.toolkit && a.id === account.id)
      )
        throw new Error("Connected app account is no longer available")
      signal?.throwIfAborted()
      const session = await sessionFor(owned, account)
      signal?.throwIfAborted()
      // SDK session.execute disables automatic transport retries for writes.
      return session.execute(slug, input, undefined, { signal })
    },
  }
}
