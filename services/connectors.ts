import * as Sentry from "@sentry/nextjs"
import { and, eq, gt, lt } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { connectorAuthAttempts } from "@/db/schema"
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
  verifyConnectorCallback,
  type ConnectorCallback,
} from "@/lib/connector-callback"
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

// Starts the provider's OAuth flow back to /workspace on `origin`. The caller
// keeps `attempt` somewhere only this user can present it again, keyed by state.
export async function beginAppConnection(
  userId: string,
  slug: string,
  origin: string | null
) {
  const started = await authorizeApp(userId, slug, origin, "/workspace", {
    apps: "connect",
  })
  if (!started.ok) return started
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
  const started = await authorizeApp(
    userId,
    input.slug,
    origin,
    MOBILE_CONNECTOR_CALLBACK_PATH
  )
  if (!started.ok) return started
  await db
    .delete(connectorAuthAttempts)
    .where(lt(connectorAuthAttempts.expiresAt, new Date()))
  await db.insert(connectorAuthAttempts).values({
    state: started.state,
    userId,
    accountId: started.accountId,
    toolkit: started.toolkit,
    returnUrl: input.returnUrl,
    expiresAt: new Date(Date.now() + MOBILE_CONNECTOR_ATTEMPT_MS),
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

// Consumes this user's stored attempt, even on failure, then verifies it the
// same way as the web flow.
export async function finishMobileAppConnection(
  userId: string,
  values: ConnectorCallback
) {
  const callback = connectorCallbackSchema.parse(values)
  const [attempt] = await db
    .delete(connectorAuthAttempts)
    .where(
      and(
        eq(connectorAuthAttempts.state, callback.state),
        eq(connectorAuthAttempts.userId, userId),
        gt(connectorAuthAttempts.expiresAt, new Date())
      )
    )
    .returning({
      userId: connectorAuthAttempts.userId,
      accountId: connectorAuthAttempts.accountId,
      toolkit: connectorAuthAttempts.toolkit,
    })
  return finishAppConnection(
    userId,
    callback,
    attempt ? JSON.stringify(attempt) : undefined
  )
}

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

export async function finishAppConnection(
  userId: string,
  values: ConnectorCallback,
  attempt: string | undefined
) {
  const parsed = connectorCallbackSchema.safeParse(values)
  if (!parsed.success) return false
  try {
    return await verifyConnectorCallback(
      userId,
      parsed.data,
      attempt,
      (owner, toolkit, cursor) =>
        getComposio().connectedAccounts.list({
          userIds: [owner],
          toolkitSlugs: [toolkit],
          accountType: "PRIVATE",
          statuses: ["ACTIVE"],
          limit: 100,
          cursor,
        })
    )
  } catch (error) {
    Sentry.captureException(error)
    throw new Error("Couldn't verify the connection. Please refresh Apps.")
  }
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
