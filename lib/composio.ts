import { emailExecutionArguments } from "@/lib/email-draft"
import { Composio } from "@composio/core"
import { z } from "zod"
import {
  createAppTools,
  type AppAccount,
  type ApprovalGate,
} from "@/lib/connector-tools"
import { appToolRisk, fallbackSummary } from "@/lib/approval-policy"
import {
  claimApproval,
  completeApproval,
  hasApprovalRule,
  requestApproval,
} from "@/lib/approvals"
import { createSessionRuntime } from "@/lib/connector-session"
import { allowedAppAccounts, assertAppCapacity } from "@/lib/billing-policy"
import { getAccountPlan } from "@/lib/usage"
import { withSandboxLock } from "@/lib/sandbox-lock"
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
  connectedAccounts?: Record<string, string[]>,
  options: { readOnly?: boolean } = {}
) {
  return getComposio().create(userId, {
    ...(toolkits && { toolkits: { enable: toolkits } }),
    ...(connectedAccounts && { connectedAccounts }),
    ...(options.readOnly && {
      tags: { enable: ["readOnlyHint"], disable: ["destructiveHint"] },
    }),
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

export async function activeAccounts(userId: string): Promise<AppAccount[]> {
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
  const plan = await getAccountPlan(userId)
  return allowedAppAccounts(
    plan.tier,
    accounts.sort((a, b) => a.id.localeCompare(b.id))
  )
}

export async function authorizeConnector(
  userId: string,
  toolkit: string,
  callbackUrl: string
) {
  return withSandboxLock(`connections:${userId}`, async () => {
    const plan = await getAccountPlan(userId)
    if (plan.tier === "free") {
      const accounts: AppAccount[] = []
      let cursor: string | undefined
      do {
        // Pending OAuth flows occupy the slot too; parallel tabs cannot reserve
        // different apps before either connection becomes active.
        const page = await getComposio().connectedAccounts.list({
          userIds: [userId],
          statuses: ["ACTIVE", "INITIATED", "INITIALIZING"],
          accountType: "PRIVATE",
          limit: 100,
          cursor,
        })
        accounts.push(
          ...page.items.map((account) => ({
            id: account.id,
            toolkit: account.toolkit.slug,
          }))
        )
        cursor = page.nextCursor ?? undefined
      } while (cursor)
      assertAppCapacity(plan.tier, accounts, toolkit)
    }
    const session = await createConnectorSession(userId)
    return session.authorize(toolkit, { callbackUrl })
  })
}

// Read-only runtime over an already-loaded account list, for background reads
// that call known tools directly instead of through model tool calls.
export function createReadOnlyRuntime(userId: string, accounts: AppAccount[]) {
  return createSessionRuntime(
    userId,
    async () => accounts,
    (owner, toolkits, bindings) =>
      createConnectorSession(owner, toolkits, bindings, { readOnly: true }),
    { readOnly: true }
  )
}

// Tool tags don't change; keep them for the life of the worker
const toolTags = new Map<string, Promise<string[] | undefined>>()
function appToolTags(slug: string) {
  let tags = toolTags.get(slug)
  if (!tags) {
    tags = getComposio()
      .tools.getRawComposioToolBySlug(slug)
      .then((tool) => tool.tags)
      .catch(() => {
        toolTags.delete(slug)
        return undefined
      })
    toolTags.set(slug, tags)
  }
  return tags
}

// Approvals for one chat. The bot is read at call time: a handoff changes it.
export function createApprovalGate(context: {
  userId: string
  chatId: string
  botId: () => string
}): ApprovalGate {
  return {
    required: async (tool) =>
      appToolRisk(tool.slug, await appToolTags(tool.slug)) === "write" &&
      !(await hasApprovalRule(context.botId(), tool.slug)),
    request: async (call) => {
      const summary = call.summary || fallbackSummary(call.slug, call.input)
      const row = await requestApproval({
        userId: context.userId,
        botId: context.botId(),
        chatId: context.chatId,
        toolkit: call.toolkit,
        toolSlug: call.slug,
        accountId: call.accountId,
        arguments: call.input,
        summary,
      })
      return { approvalId: row.id, summary }
    },
    claim: async (approvalId) => {
      const row = await claimApproval(
        context.userId,
        context.botId(),
        approvalId
      )
      return (
        row && {
          slug: row.toolSlug,
          toolkit: row.toolkit,
          accountId: row.accountId,
          input: emailExecutionArguments(row.arguments),
        }
      )
    },
    complete: completeApproval,
  }
}

export function createConnectorTools(
  userId: string,
  options: {
    readOnly?: boolean
    accountBindings?: Record<string, string>
    approvals?: ApprovalGate
  } = {}
) {
  return createAppTools(
    userId,
    createSessionRuntime(
      userId,
      async (owner) =>
        (await activeAccounts(owner)).filter(
          (account) =>
            !options.accountBindings?.[account.toolkit] ||
            options.accountBindings[account.toolkit] === account.id
        ),
      (owner, toolkits, accounts) =>
        createConnectorSession(owner, toolkits, accounts, options),
      { readOnly: options.readOnly }
    ),
    options.approvals
  )
}
