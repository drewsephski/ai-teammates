"use server"

import { auth } from "@clerk/nextjs/server"
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
    const request = await authorizeConnector(userId, toolkit)
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
