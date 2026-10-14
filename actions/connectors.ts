"use server"

import { auth } from "@clerk/nextjs/server"
import { cookies, headers } from "next/headers"
import { revalidatePath } from "next/cache"
import * as Sentry from "@sentry/nextjs"
import { z } from "zod"
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
  connectorCookieName,
  verifyConnectorCallback,
  type ConnectorCallback,
} from "@/lib/connector-callback"

export async function listConnectorApps(
  values: z.infer<typeof connectorQuerySchema>
) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
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

export async function connectApp(slug: string) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  const toolkit = toolkitSlugSchema.parse(slug)
  try {
    // Next.js validates the browser's Origin against the Server Action host.
    const origin = z.url().parse((await headers()).get("origin"))
    const state = crypto.randomUUID()
    const callback = new URL("/workspace", origin)
    callback.searchParams.set("apps", "connect")
    callback.searchParams.set("connection_state", state)
    const request = await authorizeConnector(userId, toolkit, callback.href)
    if (
      !request.redirectUrl ||
      new URL(request.redirectUrl).protocol !== "https:"
    ) {
      throw new Error("This app requires a custom authentication setup.")
    }
    ;(await cookies()).set(
      connectorCookieName(state),
      JSON.stringify({ userId, accountId: request.id, toolkit }),
      {
        httpOnly: true,
        secure: callback.protocol === "https:",
        sameSite: "lax",
        path: "/",
        maxAge: 600,
      }
    )
    return {
      ok: true as const,
      url: request.redirectUrl,
      accountId: request.id,
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

export async function completeAppConnection(values: ConnectorCallback) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  const parsed = connectorCallbackSchema.safeParse(values)
  if (!parsed.success) return false
  const callback = parsed.data
  const cookieStore = await cookies()
  const cookieName = connectorCookieName(callback.state)
  const attempt = cookieStore.get(cookieName)?.value
  // Consume the attempt even on failure; refresh cannot replay completion.
  cookieStore.delete(cookieName)
  try {
    const connected = await verifyConnectorCallback(
      userId,
      callback,
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
    if (connected) revalidatePath("/workspace")
    return connected
  } catch (error) {
    Sentry.captureException(error)
    throw new Error("Couldn't verify the connection. Please refresh Apps.")
  }
}

export async function disconnectApp(accountId: string) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  const id = z.string().min(1).max(200).parse(accountId)
  try {
    const client = getComposio()
    // Filter by owner on the provider, not a browser-supplied account identity.
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
