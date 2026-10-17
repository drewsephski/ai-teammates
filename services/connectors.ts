import * as Sentry from "@sentry/nextjs"
import { and, eq, gt, isNull, lt } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { chatMembers, chats, connectorAuthAttempts } from "@/db/schema"
import {
  connectorCatalog,
  connectorQuerySchema,
  authorizeConnector,
  getComposio,
  toolkitSlugSchema,
} from "@/lib/composio"
import { FREE_APP_LIMIT_ERROR } from "@/lib/billing-policy"
import {
  connectorCallbackSchema,
  parseConnectorAttempt,
  verifyConnectorCallback,
  type ConnectorCallback,
} from "@/lib/connector-callback"
import {
  connectContextSchema,
  type ConnectContext,
} from "@/lib/connect-context"
import { wakeAfterConnect } from "@/lib/connect-wake"
import {
  MOBILE_CONNECTOR_ATTEMPT_MS,
  MOBILE_CONNECTOR_CALLBACK_PATH,
  mobileConnectInputSchema,
  type MobileConnectInput,
} from "@/lib/mobile-connector"

export async function listConnectorApps(
  userId: string,
  values: z.infer<typeof connectorQuerySchema>
) {
  const query = connectorQuerySchema.parse(values)
  if (!process.env.COMPOSIO_API_KEY)
    return { configured: false as const, apps: [], cursor: undefined }
  try {
    return {
      configured: true as const,
      ...(await connectorCatalog(userId, query)),
    }
  } catch (error) {
    Sentry.captureException(error)
    throw new Error("Couldn't load apps. Please try again.")
  }
}

// The connect card's chat context: the chat must be the person's and the bot a
// member of it. Both misses read as "Chat not found".
async function checkedConnectContext(userId: string, values?: ConnectContext) {
  const context = connectContextSchema.parse(values ?? {})
  if (!context.chatId) return {}
  const [chat] = await db
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.id, context.chatId), eq(chats.userId, userId)))
  if (!chat) throw new Error("Chat not found")
  if (context.botId) {
    const [member] = await db
      .select({ botId: chatMembers.botId })
      .from(chatMembers)
      .where(
        and(
          eq(chatMembers.chatId, context.chatId),
          eq(chatMembers.botId, context.botId)
        )
      )
    if (!member) throw new Error("Chat not found")
  }
  return context
}

async function storeAttempt(attempt: {
  state: string
  userId: string
  accountId: string
  toolkit: string
  returnUrl: string
  chat: ConnectContext
}) {
  await db
    .delete(connectorAuthAttempts)
    .where(lt(connectorAuthAttempts.expiresAt, new Date()))
  await db.insert(connectorAuthAttempts).values({
    state: attempt.state,
    userId: attempt.userId,
    accountId: attempt.accountId,
    toolkit: attempt.toolkit,
    returnUrl: attempt.returnUrl,
    chatId: attempt.chat.chatId,
    questionId: attempt.chat.questionId,
    botId: attempt.chat.botId,
    expiresAt: new Date(Date.now() + MOBILE_CONNECTOR_ATTEMPT_MS),
  })
}

// Starts the provider's OAuth flow back to /workspace on `origin`. The caller
// keeps `attempt` somewhere only this user can present it again, keyed by state.
export async function beginAppConnection(
  userId: string,
  slug: string,
  origin: string | null,
  context?: ConnectContext
) {
  const chat = await checkedConnectContext(userId, context)
  const started = await authorizeApp(userId, slug, origin, "/workspace", {
    apps: "connect",
  })
  if (!started.ok) return started
  // The cookie carries the attempt; this row stores the result, so a retried
  // completion (a lost response) gets the same answer. Its return URL is the
  // page itself, on this origin, and is only read by the mobile bridge.
  await storeAttempt({
    state: started.state,
    userId,
    accountId: started.accountId,
    toolkit: started.toolkit,
    returnUrl: new URL("/workspace", started.callback).href,
    chat,
  })
  return {
    ok: true as const,
    url: started.url,
    accountId: started.accountId,
    state: started.state,
    secure: started.callback.protocol === "https:",
    attempt: JSON.stringify({
      userId,
      accountId: started.accountId,
      toolkit: started.toolkit,
      ...chat,
    }),
  }
}

// The native app's variant: the provider returns to an HTTPS bridge on
// `origin`, which forwards to `returnUrl` in the app. The attempt is stored
// server-side, bound to the user, since the app has no cookie for it.
export async function beginMobileAppConnection(
  userId: string,
  values: MobileConnectInput,
  origin: string | null
) {
  const input = mobileConnectInputSchema.parse(values)
  const chat = await checkedConnectContext(userId, input)
  const started = await authorizeApp(
    userId,
    input.slug,
    origin,
    MOBILE_CONNECTOR_CALLBACK_PATH
  )
  if (!started.ok) return started
  await storeAttempt({
    state: started.state,
    userId,
    accountId: started.accountId,
    toolkit: started.toolkit,
    returnUrl: input.returnUrl,
    chat,
  })
  return {
    ok: true as const,
    url: started.url,
    accountId: started.accountId,
    state: started.state,
  }
}

// Where the bridge sends the browser for this state, or null when the attempt
// is unknown or expired. The target only ever comes from the stored attempt.
export async function mobileConnectionReturnUrl(state: string) {
  if (!z.uuid().safeParse(state).success) return null
  const [attempt] = await db
    .select({ returnUrl: connectorAuthAttempts.returnUrl })
    .from(connectorAuthAttempts)
    .where(
      and(
        eq(connectorAuthAttempts.state, state),
        gt(connectorAuthAttempts.expiresAt, new Date())
      )
    )
  return attempt?.returnUrl ?? null
}

// Verifies this user's stored attempt the same way as the web flow. A
// verified attempt is kept, marked completed with its result, so a retried
// completion (the app lost the response) gets the same answer without waking
// the bot again. An attempt that could not be verified (the provider was
// unreachable) is kept for a retry, and one the provider didn't confirm is
// consumed.
export async function finishMobileAppConnection(
  userId: string,
  values: ConnectorCallback,
  deps?: FinishDeps
) {
  const callback = connectorCallbackSchema.parse(values)
  const [attempt] = await db
    .select({
      userId: connectorAuthAttempts.userId,
      accountId: connectorAuthAttempts.accountId,
      toolkit: connectorAuthAttempts.toolkit,
      chatId: connectorAuthAttempts.chatId,
      questionId: connectorAuthAttempts.questionId,
      botId: connectorAuthAttempts.botId,
    })
    .from(connectorAuthAttempts)
    .where(ownedAttempt(userId, callback.state))
  return finishAppConnection(
    userId,
    callback,
    attempt ? JSON.stringify(attempt) : undefined,
    deps
  )
}

const ownedAttempt = (userId: string, state: string) =>
  and(
    eq(connectorAuthAttempts.state, state),
    eq(connectorAuthAttempts.userId, userId),
    gt(connectorAuthAttempts.expiresAt, new Date())
  )

type Completion = { connected: boolean; woke?: boolean; inputSeq?: number }

async function authorizeApp(
  userId: string,
  slug: string,
  origin: string | null,
  callbackPath: string,
  params: Record<string, string> = {}
) {
  const toolkit = toolkitSlugSchema.parse(slug)
  try {
    const base = z.url({ protocol: /^https?$/ }).parse(origin)
    const state = crypto.randomUUID()
    const callback = new URL(callbackPath, base)
    for (const [key, value] of Object.entries(params))
      callback.searchParams.set(key, value)
    callback.searchParams.set("connection_state", state)
    const request = await authorizeConnector(userId, toolkit, callback.href)
    if (
      !request.redirectUrl ||
      new URL(request.redirectUrl).protocol !== "https:"
    ) {
      throw new Error("This app requires a custom authentication setup.")
    }
    return {
      ok: true as const,
      url: request.redirectUrl,
      accountId: request.id,
      state,
      toolkit,
      callback,
    }
  } catch (error) {
    if (error instanceof Error && error.message === FREE_APP_LIMIT_ERROR)
      return { ok: false as const, limitReached: true as const }
    Sentry.captureException(error)
    throw new Error(
      "Couldn't start the connection. This app may require custom authentication. Try another app or contact your workspace administrator."
    )
  }
}

// Provider and wake calls, injectable so tests run offline
export type FinishDeps = {
  loadAccounts?: Parameters<typeof verifyConnectorCallback>[3]
  wake?: typeof wakeAfterConnect
}

// Web and mobile both end here. The first verified completion is stored on
// the attempt, and the same owner and state get that result back afterwards.
export async function finishAppConnection(
  userId: string,
  values: ConnectorCallback,
  stored: string | undefined,
  deps: FinishDeps = {}
): Promise<Completion> {
  const parsed = connectorCallbackSchema.safeParse(values)
  if (!parsed.success) return { connected: false }
  const state = parsed.data.state
  const [done] = await db
    .select({ completion: connectorAuthAttempts.completion })
    .from(connectorAuthAttempts)
    .where(ownedAttempt(userId, state))
  if (done?.completion) return done.completion
  let connected: boolean
  try {
    connected = await verifyConnectorCallback(
      userId,
      parsed.data,
      stored,
      deps.loadAccounts ??
        ((owner, toolkit, cursor) =>
          getComposio().connectedAccounts.list({
            userIds: [owner],
            toolkitSlugs: [toolkit],
            accountType: "PRIVATE",
            statuses: ["ACTIVE"],
            limit: 100,
            cursor,
          }))
    )
  } catch (error) {
    Sentry.captureException(error)
    throw new Error("Couldn't verify the connection. Please refresh Apps.")
  }
  if (!connected) {
    // Not confirmed (cancelled, failed, or not active): the attempt is spent
    if (stored)
      await db.delete(connectorAuthAttempts).where(ownedAttempt(userId, state))
    return { connected }
  }
  // Started from a connect card: wake the bot that asked. `woke` is absent
  // for a connection started from Apps.
  const attempt = parseConnectorAttempt(stored)
  let result: Completion = { connected }
  if (attempt?.chatId) {
    const { woke, inputSeq } = await (deps.wake ?? wakeAfterConnect)(userId, {
      state,
      chatId: attempt.chatId,
      questionId: attempt.questionId,
      botId: attempt.botId,
      toolkit: attempt.toolkit,
    })
    result = { connected, woke, ...(inputSeq !== undefined && { inputSeq }) }
  }
  // Only the first writer stores; a concurrent duplicate already woke with the
  // same message ID
  await db
    .update(connectorAuthAttempts)
    .set({ completedAt: new Date(), completion: result })
    .where(
      and(ownedAttempt(userId, state), isNull(connectorAuthAttempts.completion))
    )
  return result
}

export async function disconnectApp(userId: string, accountId: string) {
  const id = z.string().min(1).max(200).parse(accountId)
  try {
    const client = getComposio()
    // Filter by owner on the provider, not a client-supplied account identity.
    let cursor: string | undefined
    let found = false
    do {
      const page = await client.connectedAccounts.list({
        userIds: [userId],
        limit: 100,
        cursor,
      })
      found = page.items.some((account) => account.id === id)
      cursor = page.nextCursor ?? undefined
    } while (!found && cursor)
    if (!found) throw new Error("Account not found")
    await client.connectedAccounts.delete(id)
  } catch (error) {
    Sentry.captureException(error)
    throw new Error("Couldn't disconnect this account. Please try again.")
  }
}
