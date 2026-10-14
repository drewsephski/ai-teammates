import { eq } from "drizzle-orm"

import { db } from "@/db"
import { chatgptConnections } from "@/db/schema"
import {
  chatGPTConfig,
  CHATGPT_ISSUER,
  CHATGPT_RESOURCE,
  requireChatGPTConfig,
} from "@/lib/chatgpt-config"
import { decryptChatGPTValue, encryptChatGPTValue } from "@/lib/chatgpt-crypto"
import {
  chatGPTDiscovery,
  ChatGPTTokenError,
  chatGPTTokenRequest,
  type ChatGPTTokens,
} from "@/lib/chatgpt-oauth"
import {
  CHATGPT_RECONNECT_ERROR,
  hasChatGPTPlanGrant,
} from "@/lib/chatgpt-policy"
import { withSandboxLock } from "@/lib/sandbox-lock"

export function chatGPTCredentialContext(
  userId: string,
  kind: "access" | "refresh"
) {
  return `chatgpt:${userId}:${kind}`
}

export function protectedChatGPTTokens(userId: string, tokens: ChatGPTTokens) {
  const config = requireChatGPTConfig()
  const scopes = tokens.scope?.split(/\s+/).filter(Boolean) ?? []
  const usable =
    config.planUsageEnabled &&
    hasChatGPTPlanGrant(scopes) &&
    !!tokens.access_token &&
    !!tokens.expires_in
  return {
    scopes,
    enabled: usable,
    accessToken: usable
      ? encryptChatGPTValue(
          tokens.access_token!,
          chatGPTCredentialContext(userId, "access"),
          config.encryptionKey
        )
      : null,
    refreshToken:
      usable && tokens.refresh_token
        ? encryptChatGPTValue(
            tokens.refresh_token,
            chatGPTCredentialContext(userId, "refresh"),
            config.encryptionKey
          )
        : null,
    expiresAt: usable ? new Date(Date.now() + tokens.expires_in! * 1000) : null,
    updatedAt: new Date(),
  }
}

export async function getChatGPTStatus(userId: string) {
  const config = chatGPTConfig()
  const row = await db.query.chatgptConnections.findFirst({
    where: eq(chatgptConnections.userId, userId),
    columns: {
      issuer: true,
      clientId: true,
      email: true,
      name: true,
      enabled: true,
      scopes: true,
      model: true,
      expiresAt: true,
      refreshToken: true,
    },
  })
  const matchesClient =
    !!config &&
    row?.clientId === config.clientId &&
    row.issuer === CHATGPT_ISSUER
  return {
    available: !!config,
    planAvailable: !!config?.planUsageEnabled,
    connected: !!row,
    enabled: row?.enabled ?? false,
    authorized:
      !!row &&
      matchesClient &&
      hasChatGPTPlanGrant(row.scopes) &&
      !!config?.planUsageEnabled,
    needsReconnect:
      !!row &&
      ((row.enabled && !matchesClient) ||
        (hasChatGPTPlanGrant(row.scopes) &&
          !row.refreshToken &&
          (!row.expiresAt || row.expiresAt.getTime() <= Date.now() + 60_000))),
    email: row?.email ?? null,
    name: row?.name ?? null,
    model: row?.model ?? null,
  }
}
export type ChatGPTStatus = Awaited<ReturnType<typeof getChatGPTStatus>>

// Selection is server-owned. An expired/revoked grant stays selected until the
// user explicitly switches providers; it never silently spends Krafty credit.
export async function isChatGPTSelected(userId: string) {
  const row = await db.query.chatgptConnections.findFirst({
    where: eq(chatgptConnections.userId, userId),
    columns: { enabled: true },
  })
  return row?.enabled ?? false
}

export async function getChatGPTAccessToken(
  userId: string,
  requireSelected = true
) {
  const config = requireChatGPTConfig()
  if (!config.planUsageEnabled) throw new Error(CHATGPT_RECONNECT_ERROR)
  return withSandboxLock(`chatgpt:${userId}`, async () => {
    const row = await db.query.chatgptConnections.findFirst({
      where: eq(chatgptConnections.userId, userId),
    })
    if (
      !row ||
      (requireSelected && !row.enabled) ||
      row.clientId !== config.clientId ||
      row.issuer !== CHATGPT_ISSUER ||
      !hasChatGPTPlanGrant(row.scopes)
    )
      throw new Error(CHATGPT_RECONNECT_ERROR)
    if (
      row.accessToken &&
      row.expiresAt &&
      row.expiresAt.getTime() > Date.now() + 60_000
    )
      return decryptChatGPTValue(
        row.accessToken,
        chatGPTCredentialContext(userId, "access"),
        config.encryptionKey
      )
    if (!row.refreshToken) throw new Error(CHATGPT_RECONNECT_ERROR)
    try {
      const tokens = await chatGPTTokenRequest(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: decryptChatGPTValue(
            row.refreshToken,
            chatGPTCredentialContext(userId, "refresh"),
            config.encryptionKey
          ),
          resource: CHATGPT_RESOURCE,
        })
      )
      if (!tokens.access_token || !tokens.expires_in)
        throw new ChatGPTTokenError(false)
      const scopes = tokens.scope?.split(/\s+/).filter(Boolean) ?? row.scopes
      if (!hasChatGPTPlanGrant(scopes)) throw new ChatGPTTokenError(true)
      await db
        .update(chatgptConnections)
        .set({
          ...protectedChatGPTTokens(userId, {
            ...tokens,
            scope: scopes.join(" "),
          }),
          enabled: row.enabled,
          refreshToken: tokens.refresh_token
            ? encryptChatGPTValue(
                tokens.refresh_token,
                chatGPTCredentialContext(userId, "refresh"),
                config.encryptionKey
              )
            : row.refreshToken,
        })
        .where(eq(chatgptConnections.userId, userId))
      return tokens.access_token
    } catch (error) {
      if (error instanceof ChatGPTTokenError && error.reconnect)
        await db
          .update(chatgptConnections)
          .set({
            accessToken: null,
            refreshToken: null,
            expiresAt: null,
            updatedAt: new Date(),
          })
          .where(eq(chatgptConnections.userId, userId))
      throw new Error(CHATGPT_RECONNECT_ERROR)
    }
  })
}

export async function disconnectChatGPT(userId: string) {
  const config = requireChatGPTConfig()
  return withSandboxLock(`chatgpt:${userId}`, async () => {
    const row = await db.query.chatgptConnections.findFirst({
      where: eq(chatgptConnections.userId, userId),
    })
    let revoked = !row?.refreshToken
    if (row?.refreshToken && row.clientId === config.clientId) {
      try {
        const metadata = await chatGPTDiscovery()
        if (metadata.revocation_endpoint) {
          const body = new URLSearchParams({
            token: decryptChatGPTValue(
              row.refreshToken,
              chatGPTCredentialContext(userId, "refresh"),
              config.encryptionKey
            ),
            token_type_hint: "refresh_token",
            client_id: row.clientId,
          })
          const response = await fetch(metadata.revocation_endpoint, {
            method: "POST",
            body,
            redirect: "error",
            signal: AbortSignal.timeout(10_000),
          })
          revoked = response.ok
        }
      } catch {
        revoked = false
      }
    }
    await db
      .update(chatgptConnections)
      .set({
        enabled: false,
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        scopes: [],
        model: null,
        updatedAt: new Date(),
      })
      .where(eq(chatgptConnections.userId, userId))
    return { revoked }
  })
}
