import { Composio } from "@composio/core"
import { z } from "zod"
import { createAppTools, type AppAccount } from "@/lib/connector-tools"
export type { ConnectorTools } from "@/lib/connector-tools"

export const toolkitSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,99}$/)
export const connectorQuerySchema = z.object({
  search: z.string().trim().max(100).default(""),
  cursor: z.string().max(1000).optional(),
  connected: z.boolean().default(false),
})

export type ConnectorApp = {
  slug: string
  name: string
  logo?: string
  connected: boolean
  accountId?: string
  status?: string
  noAuth: boolean
}

let client: Composio | undefined
export function getComposio() {
  if (!process.env.COMPOSIO_API_KEY)
    throw new Error("App connections are not configured yet.")
  return (client ??= new Composio({ apiKey: process.env.COMPOSIO_API_KEY }))
}

// Only server-derived Clerk IDs reach this module. No global developer account.
export function createConnectorSession(
  userId: string,
  toolkits?: string[],
  connectedAccounts?: Record<string, string[]>
) {
  return getComposio().create(userId, {
    ...(toolkits && { toolkits: { enable: toolkits } }),
    ...(connectedAccounts && { connectedAccounts }),
    sandbox: { enable: false },
    manageConnections: { enable: false },
  })
}

export async function connectorCatalog(
  userId: string,
  values: z.infer<typeof connectorQuerySchema>
) {
  const query = connectorQuerySchema.parse(values)
  const session = await createConnectorSession(userId)
  const result = await session.toolkits({
    limit: 24,
    search: query.search || undefined,
    cursor: query.cursor,
    ...(query.connected && { isConnected: true }),
  })
  return {
    cursor: result.cursor,
    apps: result.items.map((app): ConnectorApp => ({
      slug: app.slug,
      name: app.name,
      logo: app.logo,
      connected: app.connection?.isActive ?? false,
      accountId: app.connection?.connectedAccount?.id,
      status: app.connection?.connectedAccount?.status,
      noAuth: app.isNoAuth,
    })),
  }
}

async function activeAccounts(userId: string): Promise<AppAccount[]> {
  const accounts: AppAccount[] = []
  let cursor: string | undefined
  do {
    const page = await getComposio().connectedAccounts.list({
      userIds: [userId],
      statuses: ["ACTIVE"],
      accountType: "PRIVATE",
      limit: 100,
      cursor,
    })
    accounts.push(
      ...page.items
        .filter((account) => account.status === "ACTIVE" && !account.isDisabled)
        .map((account) => ({ id: account.id, toolkit: account.toolkit.slug }))
    )
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  return accounts
}

export function createConnectorTools(userId: string) {
  return createAppTools(userId, {
    accounts: activeAccounts,
    search: async (query, toolkits, signal) => {
      const tools = await getComposio().tools.getRawComposioTools(
        { toolkits, search: query, limit: 12 },
        undefined,
        { signal }
      )
      return tools
        .filter((entry) => entry.toolkit && entry.inputParameters)
        .map((entry) => ({
          slug: entry.slug,
          toolkit: entry.toolkit?.slug ?? "",
          description: entry.description ?? entry.slug,
          inputSchema: entry.inputParameters,
        }))
    },
    execute: async (userId, slug, input, account, signal) => {
      signal?.throwIfAborted()
      const session = await createConnectorSession(userId, [account.toolkit], {
        [account.toolkit]: [account.id],
      })
      signal?.throwIfAborted()
      return session.execute(slug, input, { account: account.id })
    },
  })
}
