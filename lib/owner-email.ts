import { createClerkClient } from "@clerk/backend"

// Not @clerk/nextjs: the chat agent asks too, outside Next.js
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })

const recent = new Map<string, { at: number; addresses: Promise<string[]> }>()
const MEMO_MS = 5 * 60_000

// The email addresses the person verified on their Krafty account, lowercased.
// Empty when Clerk doesn't know them or can't be reached: then nothing counts
// as mail to themselves, and every send waits for approval as before.
export function ownerEmailAddresses(userId: string): Promise<string[]> {
  const now = Date.now()
  const hit = recent.get(userId)
  if (hit && now - hit.at < MEMO_MS) return hit.addresses
  const addresses = clerk.users.getUser(userId).then(
    (user) =>
      user.emailAddresses
        .filter((email) => email.verification?.status === "verified")
        .map((email) => email.emailAddress.toLowerCase()),
    () => {
      recent.delete(userId)
      return [] as string[]
    }
  )
  recent.set(userId, { at: now, addresses })
  if (recent.size > 5_000) recent.delete(recent.keys().next().value!)
  return addresses
}
