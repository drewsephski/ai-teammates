import type { Feature } from "@/lib/billing"

// Who is asking. Services never read the request; actions and route handlers
// resolve the Clerk session and hand over the user and their plan features.
export type Caller = {
  userId: string
  has: (params: { feature: Feature }) => boolean
}
