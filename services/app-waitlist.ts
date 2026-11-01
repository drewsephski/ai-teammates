import { db } from "@/db"
import { appWaitlist } from "@/db/schema"
import { appWaitlistSchema } from "@/lib/app-waitlist"

// Intentionally public: visitors can subscribe without creating an account.
export async function joinAppWaitlist(input: unknown) {
  const { email, platforms } = appWaitlistSchema.parse(input)
  return db
    .insert(appWaitlist)
    .values(platforms.map((platform) => ({ email, platform })))
    .onConflictDoNothing()
    .returning({ email: appWaitlist.email, platform: appWaitlist.platform })
}
