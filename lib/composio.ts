import * as Sentry from "@sentry/node"

import {
  directEmailRecipients,
  emailExecutionArguments,
} from "@/lib/email-draft"
import { Composio } from "@composio/core"
import { z } from "zod"
import {
  createAppTools,
  runClaimedCall,
  type AppAccount,
  type ApprovalGate,
} from "@/lib/connector-tools"
import {
  appToolRisk,
  fallbackSummary,
  SELF_EMAILS_PER_TURN,
  selfAddressedEmail,
} from "@/lib/approval-policy"
import { ownerEmailAddresses } from "@/lib/owner-email"
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
import {
  RECONNECT_STATUSES,
  holdsAppSlot,
} from "@/lib/connector-account-policy"
import {
  expiredAccountIds,
  expiredToolkits,
  limitedToolkits,
} from "@/lib/connection-health"
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
  // The person had this app connected and the connection no longer works
  needsReconnect?: boolean
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
      ...(!app.connection?.isActive &&
        ["EXPIRED", "REVOKED", "INACTIVE"].includes(
          app.connection?.connectedAccount?.status ?? ""
        ) && { needsReconnect: true }),
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
        .map((account) => ({
          id: account.id,
          toolkit: account.toolkit.slug,
          ...((account.alias || account.wordId) && {
            label: account.alias ?? account.wordId ?? undefined,
          }),
          connectedAt: account.createdAt,
        }))
    )
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  const plan = await getAccountPlan(userId)
  // An account this run saw rejected doesn't count while Composio still
  // calls it ACTIVE; the person's other accounts for the app do
  const rejected = expiredAccountIds(userId)
  return allowedAppAccounts(
    plan.tier,
    accounts
      .filter((account) => !rejected.has(account.id))
      .sort((a, b) => a.id.localeCompare(b.id))
  )
}

// Toolkits the person connected once whose connection stopped working (expired,
// revoked or inactive), plus any this run just saw rejected. A toolkit with a
// working account is never listed. Best effort: a provider failure gives the
// run's own flags only.
export async function reconnectToolkits(
  userId: string,
  active: { toolkit: string }[]
): Promise<Set<string>> {
  const toolkits = new Set(expiredToolkits(userId))
  try {
    let cursor: string | undefined
    // Three pages of 100 bound the calls
    for (let pages = 0; pages < 3; pages++) {
      const page = await getComposio().connectedAccounts.list({
        userIds: [userId],
        statuses: [...RECONNECT_STATUSES],
        accountType: "PRIVATE",
        limit: 100,
        cursor,
      })
      for (const account of page.items) toolkits.add(account.toolkit.slug)
      cursor = page.nextCursor ?? undefined
      if (!cursor) break
    }
  } catch {
    // The status is advice for the card, not a gate
  }
  const working = new Set(active.map((account) => account.toolkit))
  // A working account for the app means nothing needs redoing
  for (const toolkit of working) toolkits.delete(toolkit)
  return toolkits
}

// Apps whose account works but was refused for a missing permission this run
export async function limitedConnectorToolkits(userId: string) {
  return limitedToolkits(userId)
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
          ...page.items
            .filter((account) => holdsAppSlot(account))
            .map((account) => ({
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
// Made per turn, so the count of mail sent to the owner is per turn too.
export function createApprovalGate(context: {
  userId: string
  chatId: string
  botId: () => string
  // The message that started the task the turn works on, so a routine run
  // follows its approvals (lib/approvals.ts, approvalOrigin)
  originMessageId?: () => string | undefined
  ownAddresses?: (userId: string) => Promise<string[]>
}): ApprovalGate {
  let ownerEmails = 0
  return {
    required: async (tool, accountId) => {
      const tags = await appToolTags(tool.slug)
      return (
        appToolRisk(tool.slug, tags) === "write" &&
        !(await hasApprovalRule(context.botId(), tool.slug, accountId, tags))
      )
    },
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
        originMessageId: context.originMessageId?.(),
      })
      return { approvalId: row.id, summary }
    },
    claim: async (approvalId) => {
      // Only from the chat it was asked in
      const row = await claimApproval(
        context.userId,
        context.botId(),
        approvalId,
        context.chatId
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
    sendsToOwner: async (tool, input) => {
      if (ownerEmails >= SELF_EMAILS_PER_TURN) return false
      const recipients = directEmailRecipients(tool, input)
      if (!recipients) return false
      const own = await (context.ownAddresses ?? ownerEmailAddresses)(
        context.userId
      )
      if (!selfAddressedEmail(recipients, own)) return false
      ownerEmails++
      Sentry.logger.info("Email to the owner sent without approval", {
        "user.id": context.userId,
        "chat.id": context.chatId,
        "tool.slug": tool.slug,
      })
      return true
    },
  }
}

// Runs an approval the owner just approved, from the decision itself, so it
// never depends on the bot calling runApprovedAction. Undefined when there
// was nothing to run: not an app approval, already claimed, or not approved.
export async function runApprovedCall(approval: {
  id: string
  userId: string
  botId: string
  chatId: string
  kind: "app" | "computer"
}) {
  if (approval.kind !== "app") return undefined
  const gate = createApprovalGate({
    userId: approval.userId,
    chatId: approval.chatId,
    botId: () => approval.botId,
  })
  const call = await gate.claim(approval.id)
  if (!call) return undefined
  const runtime = createSessionRuntime(
    approval.userId,
    async (owner) => activeAccounts(owner),
    (owner, toolkits, accounts) =>
      createConnectorSession(owner, toolkits, accounts)
  )
  return runClaimedCall(
    approval.userId,
    runtime,
    gate.complete,
    approval.id,
    call
  )
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
