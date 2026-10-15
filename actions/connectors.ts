"use server"

import { auth } from "@clerk/nextjs/server"
import { cookies, headers } from "next/headers"
import { revalidatePath } from "next/cache"
import type { z } from "zod"
import type { connectorQuerySchema } from "@/lib/composio"
import {
  connectorCallbackSchema,
  connectorCookieName,
  type ConnectorCallback,
} from "@/lib/connector-callback"
import * as service from "@/services/connectors"

async function signedIn() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return userId
}

export async function listConnectorApps(
  values: z.infer<typeof connectorQuerySchema>
) {
  return service.listConnectorApps(await signedIn(), values)
}

export async function connectApp(slug: string) {
  const userId = await signedIn()
  // Next.js validates the browser's Origin against the Server Action host.
  const origin = (await headers()).get("origin")
  const started = await service.beginAppConnection(userId, slug, origin)
  if (!started.ok) return started
  const cookieStore = await cookies()
  cookieStore.set(connectorCookieName(started.state), started.attempt, {
    httpOnly: true,
    secure: started.secure,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  })
  return { ok: true as const, url: started.url, accountId: started.accountId }
}

export async function completeAppConnection(values: ConnectorCallback) {
  const userId = await signedIn()
  const parsed = connectorCallbackSchema.safeParse(values)
  if (!parsed.success) return false
  const cookieStore = await cookies()
  const cookieName = connectorCookieName(parsed.data.state)
  const attempt = cookieStore.get(cookieName)?.value
  // Consume the attempt even on failure; refresh cannot replay completion.
  cookieStore.delete(cookieName)
  const connected = await service.finishAppConnection(
    userId,
    parsed.data,
    attempt
  )
  if (connected) revalidatePath("/workspace")
  return connected
}

export async function disconnectApp(accountId: string) {
  await service.disconnectApp(await signedIn(), accountId)
}
