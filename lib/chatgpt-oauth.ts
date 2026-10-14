import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose"
import { z } from "zod"

import {
  CHATGPT_ISSUER,
  CHATGPT_RESOURCE,
  requireChatGPTConfig,
} from "@/lib/chatgpt-config"
import { CHATGPT_PLAN_SCOPE } from "@/lib/chatgpt-policy"

const endpoint = z
  .url()
  .refine((value) => new URL(value).origin === CHATGPT_ISSUER)
const discoverySchema = z.object({
  issuer: z.literal(CHATGPT_ISSUER),
  authorization_endpoint: endpoint,
  token_endpoint: endpoint,
  jwks_uri: endpoint,
  revocation_endpoint: endpoint.optional(),
  authorization_response_iss_parameter_supported: z.boolean().optional(),
})

let discovery:
  { expiresAt: number; value: z.infer<typeof discoverySchema> } | undefined
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined

export async function chatGPTDiscovery() {
  if (discovery && discovery.expiresAt > Date.now()) return discovery.value
  const response = await fetch(
    `${CHATGPT_ISSUER}/.well-known/openid-configuration`,
    {
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
      redirect: "error",
    }
  )
  if (!response.ok)
    throw new Error("ChatGPT sign-in is temporarily unavailable.")
  const value = discoverySchema.parse(await response.json())
  discovery = { value, expiresAt: Date.now() + 3_600_000 }
  return value
}

export const chatGPTTokensSchema = z.object({
  id_token: z.string().min(1).optional(),
  access_token: z.string().min(1).optional(),
  refresh_token: z.string().min(1).optional(),
  token_type: z.string().optional(),
  expires_in: z.number().int().positive().max(31_536_000).optional(),
  scope: z.string().optional(),
})
export type ChatGPTTokens = z.infer<typeof chatGPTTokensSchema>

export class ChatGPTTokenError extends Error {
  constructor(readonly reconnect: boolean) {
    super("ChatGPT authorization could not be renewed.")
    this.name = "ChatGPTTokenError"
  }
}

export function chatGPTClientHeaders() {
  const config = requireChatGPTConfig()
  const headers = new Headers({
    "Content-Type": "application/x-www-form-urlencoded",
    accept: "application/json",
  })
  if (config.clientSecret) {
    const encode = (value: string) =>
      new URLSearchParams({ v: value }).toString().slice(2)
    headers.set(
      "Authorization",
      `Basic ${Buffer.from(`${encode(config.clientId)}:${encode(config.clientSecret)}`).toString("base64")}`
    )
  }
  return headers
}

export async function chatGPTTokenRequest(parameters: URLSearchParams) {
  const config = requireChatGPTConfig()
  const metadata = await chatGPTDiscovery()
  parameters.set("client_id", config.clientId)
  const headers = chatGPTClientHeaders()
  const response = await fetch(metadata.token_endpoint, {
    method: "POST",
    headers,
    body: parameters,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
    redirect: "error",
  })
  if (!response.ok) {
    const error: unknown = await response.json().catch(() => null)
    const invalidGrant =
      !!error &&
      typeof error === "object" &&
      "error" in error &&
      error.error === "invalid_grant"
    throw new ChatGPTTokenError(invalidGrant || response.status === 401)
  }
  const tokens = chatGPTTokensSchema.safeParse(await response.json())
  if (!tokens.success) throw new ChatGPTTokenError(false)
  if (
    tokens.data.token_type &&
    tokens.data.token_type.toLowerCase() !== "bearer"
  )
    throw new ChatGPTTokenError(false)
  return tokens.data
}

export function validateChatGPTIdentity(payload: JWTPayload, nonce: string) {
  if (payload.nonce !== nonce || !payload.sub)
    throw new Error("ChatGPT identity could not be verified.")
  const clientId = requireChatGPTConfig().clientId
  if (
    (payload.azp && payload.azp !== clientId) ||
    (Array.isArray(payload.aud) &&
      payload.aud.length > 1 &&
      payload.azp !== clientId)
  )
    throw new Error("ChatGPT identity could not be verified.")
  return {
    subject: payload.sub,
    email:
      typeof payload.email === "string" && payload.email_verified === true
        ? payload.email
        : null,
    name: typeof payload.name === "string" ? payload.name : null,
  }
}

export async function verifyChatGPTIdentity(idToken: string, nonce: string) {
  const config = requireChatGPTConfig()
  const metadata = await chatGPTDiscovery()
  jwks ??= createRemoteJWKSet(new URL(metadata.jwks_uri))
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: metadata.issuer,
    audience: config.clientId,
    requiredClaims: ["sub", "exp", "iat", "nonce"],
    algorithms: ["RS256", "ES256"],
    clockTolerance: 5,
    maxTokenAge: "10m",
  })
  return validateChatGPTIdentity(payload, nonce)
}

export async function chatGPTAuthorizationUrl(input: {
  state: string
  nonce: string
  challenge: string
  reconsent?: boolean
}) {
  const config = requireChatGPTConfig()
  const metadata = await chatGPTDiscovery()
  const url = new URL(metadata.authorization_endpoint)
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: [
      "openid",
      "profile",
      "email",
      ...(config.planUsageEnabled
        ? ["offline_access", "resource.invoke", CHATGPT_PLAN_SCOPE]
        : []),
    ].join(" "),
    state: input.state,
    nonce: input.nonce,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    ...(input.reconsent && { prompt: "consent" }),
    ...(config.planUsageEnabled && { resource: CHATGPT_RESOURCE }),
  }).toString()
  return url
}
