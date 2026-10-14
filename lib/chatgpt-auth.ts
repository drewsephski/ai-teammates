import { createClerkClient } from "@clerk/backend"
import { and, eq, gt, lt } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { chatgptAuthAttempts, chatgptConnections } from "@/db/schema"
import {
  CHATGPT_ISSUER,
  CHATGPT_RESOURCE,
  requireChatGPTConfig,
} from "@/lib/chatgpt-config"
import {
  decryptChatGPTValue,
  encryptChatGPTValue,
  hashChatGPTValue,
  randomChatGPTValue,
} from "@/lib/chatgpt-crypto"
import {
  chatGPTAuthorizationUrl,
  chatGPTDiscovery,
  chatGPTTokenRequest,
  verifyChatGPTIdentity,
} from "@/lib/chatgpt-oauth"
import { protectedChatGPTTokens } from "@/lib/chatgpt-connection"
import { withSandboxLock } from "@/lib/sandbox-lock"

const attemptSchema = z.object({
  verifier: z.string(),
  nonce: z.string(),
  userId: z.string().nullable(),
  intent: z.enum(["sign-in", "sign-up", "connect"]),
})
export type ChatGPTIntent = z.infer<typeof attemptSchema>["intent"]

export class ChatGPTAuthError extends Error {
  constructor(
    readonly code:
      "failed" | "expired" | "denied" | "link_required" | "already_linked"
  ) {
    super("ChatGPT sign-in could not be completed.")
    this.name = "ChatGPTAuthError"
  }
}

export function chatGPTCookieName(kind: "oauth" | "session") {
  return `${requireChatGPTConfig().origin.startsWith("https:") ? "__Host-" : ""}chatgpt_${kind}`
}

export async function startChatGPTAuth(
  intent: ChatGPTIntent,
  userId: string | null
) {
  const config = requireChatGPTConfig()
  if (intent === "connect" && !userId) throw new ChatGPTAuthError("failed")
  const state = randomChatGPTValue()
  const browserBinding = randomChatGPTValue()
  const verifier = randomChatGPTValue()
  const nonce = randomChatGPTValue()
  const id = hashChatGPTValue(state)
  const url = await chatGPTAuthorizationUrl({
    state,
    nonce,
    challenge: hashChatGPTValue(verifier),
  })
  await db
    .delete(chatgptAuthAttempts)
    .where(lt(chatgptAuthAttempts.expiresAt, new Date()))
  await db.insert(chatgptAuthAttempts).values({
    id,
    browserHash: hashChatGPTValue(browserBinding),
    payload: encryptChatGPTValue(
      JSON.stringify({ verifier, nonce, userId, intent }),
      `chatgpt:attempt:${id}`,
      config.encryptionKey
    ),
    expiresAt: new Date(Date.now() + 10 * 60_000),
  })
  return { url, browserBinding }
}

// Called only after consuming a browser-bound, one-time OAuth transaction.
async function resolveChatGPTUser(
  identity: { subject: string; email: string | null; name: string | null },
  signedInUserId: string | null
) {
  const config = requireChatGPTConfig()
  const identityKey = hashChatGPTValue(
    `${CHATGPT_ISSUER}:${config.clientId}:${identity.subject}`
  )
  return withSandboxLock(`chatgpt-identity:${identityKey}`, async () => {
    const linked = await db.query.chatgptConnections.findFirst({
      where: and(
        eq(chatgptConnections.issuer, CHATGPT_ISSUER),
        eq(chatgptConnections.clientId, config.clientId),
        eq(chatgptConnections.subject, identity.subject)
      ),
      columns: { userId: true },
    })
    if (signedInUserId) {
      if (linked && linked.userId !== signedInUserId)
        throw new ChatGPTAuthError("already_linked")
      return signedInUserId
    }
    if (linked) return linked.userId

    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
    const externalId = `chatgpt_${identityKey}`
    const existing = await clerk.users.getUserList({
      externalId: [externalId],
      limit: 1,
    })
    if (existing.data[0]) return existing.data[0].id
    if (!identity.email) throw new ChatGPTAuthError("link_required")
    const matchingEmail = await clerk.users.getUserList({
      emailAddress: [identity.email],
      limit: 1,
    })
    // Email equality cannot link an existing account. The user must authenticate it.
    if (matchingEmail.totalCount > 0)
      throw new ChatGPTAuthError("link_required")
    try {
      const user = await clerk.users.createUser({
        externalId,
        emailAddress: [identity.email],
        skipPasswordRequirement: true,
        // The auth button explains acceptance of Krafty's terms/privacy policy.
        legalAcceptedAt: new Date(),
      })
      return user.id
    } catch {
      throw new ChatGPTAuthError("link_required")
    }
  })
}

export async function completeChatGPTAuth(
  url: URL,
  browserBinding: string | undefined,
  currentUserId: string | null
) {
  const config = requireChatGPTConfig()
  const state = url.searchParams.get("state")
  if (
    !state ||
    !browserBinding ||
    state.length > 256 ||
    browserBinding.length > 256
  )
    throw new ChatGPTAuthError("expired")
  const id = hashChatGPTValue(state)
  const [attempt] = await db
    .delete(chatgptAuthAttempts)
    .where(
      and(
        eq(chatgptAuthAttempts.id, id),
        eq(chatgptAuthAttempts.browserHash, hashChatGPTValue(browserBinding)),
        gt(chatgptAuthAttempts.expiresAt, new Date())
      )
    )
    .returning({ payload: chatgptAuthAttempts.payload })
  if (!attempt) throw new ChatGPTAuthError("expired")
  const transaction = attemptSchema.parse(
    JSON.parse(
      decryptChatGPTValue(
        attempt.payload,
        `chatgpt:attempt:${id}`,
        config.encryptionKey
      )
    )
  )
  if (transaction.userId !== currentUserId)
    throw new ChatGPTAuthError("expired")
  const issuer = url.searchParams.get("iss")
  const metadata = await chatGPTDiscovery()
  if (
    (issuer && issuer !== CHATGPT_ISSUER) ||
    (metadata.authorization_response_iss_parameter_supported &&
      issuer !== CHATGPT_ISSUER)
  )
    throw new ChatGPTAuthError("failed")
  if (url.searchParams.has("error")) throw new ChatGPTAuthError("denied")
  const returnedClient = url.searchParams.get("client_id")
  if (returnedClient && returnedClient !== config.clientId)
    throw new ChatGPTAuthError("failed")
  const code = url.searchParams.get("code")
  if (!code || code.length > 8192) throw new ChatGPTAuthError("failed")
  const tokens = await chatGPTTokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: transaction.verifier,
      redirect_uri: config.redirectUri,
      ...(config.planUsageEnabled && { resource: CHATGPT_RESOURCE }),
    })
  )
  if (!tokens.id_token) throw new ChatGPTAuthError("failed")
  const identity = await verifyChatGPTIdentity(
    tokens.id_token,
    transaction.nonce
  )
  const userId = await resolveChatGPTUser(identity, transaction.userId)
  await withSandboxLock(`chatgpt:${userId}`, async () => {
    const existing = await db.query.chatgptConnections.findFirst({
      where: eq(chatgptConnections.userId, userId),
    })
    if (
      existing &&
      (existing.subject !== identity.subject ||
        existing.clientId !== config.clientId ||
        existing.issuer !== CHATGPT_ISSUER)
    )
      throw new ChatGPTAuthError("already_linked")
    const data = {
      issuer: CHATGPT_ISSUER,
      clientId: config.clientId,
      subject: identity.subject,
      email: identity.email,
      name: identity.name,
      ...protectedChatGPTTokens(userId, tokens),
    }
    // Sign-in preserves the saved funding choice. Losing a grant must not
    // silently switch a subscription-backed account to app-funded requests.
    if (existing && transaction.intent !== "connect") data.enabled = existing.enabled
    if (existing?.enabled && !data.enabled) data.enabled = true
    await db
      .insert(chatgptConnections)
      .values({ userId, ...data })
      .onConflictDoUpdate({ target: chatgptConnections.userId, set: data })
  })
  if (transaction.userId) return { ticket: null }
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
  const ticket = await clerk.signInTokens.createSignInToken({
    userId,
    expiresInSeconds: 60,
  })
  return { ticket: ticket.token }
}
