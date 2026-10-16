import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto"
import { z } from "zod"

// A desktop ticket lets one WebSocket upgrade open one chat's computer. The
// native app puts it in the socket URL (WebViews can't set headers), so it
// replaces the full Clerk session token there: it is bound to the user and
// the chat, expires within a minute, and the gateway accepts it once.
export const DESKTOP_TICKET_TTL_MS = 60_000

const payloadSchema = z.object({
  u: z.string().min(1),
  c: z.string().min(1),
  e: z.number().int(),
  n: z.string().min(16),
})

// Derived from the server secret so no new variable is needed; the label
// keeps the key from signing or verifying anything else
function ticketKey(secret: string) {
  if (!secret) throw new Error("Missing desktop ticket secret")
  return Buffer.from(
    hkdfSync("sha256", secret, "", "krafty desktop ticket v1", 32)
  )
}

const sign = (key: Buffer, body: string) =>
  createHmac("sha256", key).update(body).digest("base64url")

export function createDesktopTicket(
  { userId, chatId }: { userId: string; chatId: string },
  secret: string,
  now = Date.now()
) {
  const body = Buffer.from(
    JSON.stringify({
      u: userId,
      c: chatId,
      e: now + DESKTOP_TICKET_TTL_MS,
      n: randomBytes(16).toString("base64url"),
    })
  ).toString("base64url")
  return {
    ticket: `${body}.${sign(ticketKey(secret), body)}`,
    expiresAt: now + DESKTOP_TICKET_TTL_MS,
  }
}

// Nonces already used, with when they expire. One server process serves
// every upgrade today; with several, a ticket could be replayed on another
// instance within its minute, and is still bound to the same user and chat.
export class TicketReplayGuard {
  private readonly used = new Map<string, number>()

  claim(nonce: string, expiresAt: number, now = Date.now()) {
    for (const [key, expiry] of this.used)
      if (expiry <= now) this.used.delete(key)
    if (this.used.has(nonce)) return false
    this.used.set(nonce, expiresAt)
    return true
  }
}

// The user the ticket was issued to, or null when it is forged, expired,
// for another chat, or already used
export function verifyDesktopTicket(
  ticket: string,
  chatId: string,
  secret: string,
  guard: TicketReplayGuard,
  now = Date.now()
) {
  const [body, signature, extra] = ticket.split(".")
  if (!body || !signature || extra !== undefined) return null
  const expected = Buffer.from(sign(ticketKey(secret), body))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return null
  let value: unknown
  try {
    value = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
  } catch {
    return null
  }
  const payload = payloadSchema.safeParse(value)
  if (!payload.success) return null
  const { u: userId, c, e: expiresAt, n: nonce } = payload.data
  if (c !== chatId || expiresAt <= now) return null
  if (!guard.claim(nonce, expiresAt, now)) return null
  return { userId }
}
