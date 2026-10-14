import { createHmac, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { forYouSuggestionSchema, type ForYouSuggestion } from "@/lib/for-you"

const tokenSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().min(1),
  expiresAt: z.number().int(),
  accountId: z.string().min(1),
  suggestion: forYouSuggestionSchema,
})
export type ForYouToken = z.infer<typeof tokenSchema>

function signature(body: string, secret: string) {
  if (!secret) throw new Error("Recommendation signing is not configured")
  return createHmac("sha256", secret)
    .update(`krafty-for-you:v1:${body}`)
    .digest()
}

export function signForYouToken(value: ForYouToken, secret: string) {
  const body = Buffer.from(JSON.stringify(tokenSchema.parse(value))).toString(
    "base64url"
  )
  return `${body}.${signature(body, secret).toString("base64url")}`
}

export function verifyForYouToken(
  token: string,
  userId: string,
  secret: string
): ForYouToken {
  if (token.length > 10_000) throw new Error("Invalid recommendation")
  const [body, mac, extra] = token.split(".")
  if (!body || !mac || extra) throw new Error("Invalid recommendation")
  const expected = signature(body, secret)
  const supplied = Buffer.from(mac, "base64url")
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    throw new Error("Invalid recommendation")
  const value = tokenSchema.parse(
    JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
  )
  if (value.userId !== userId || value.expiresAt <= Date.now())
    throw new Error("This recommendation expired. Refresh For you.")
  return value
}

export type ForYouCard = ForYouSuggestion & { token: string }
