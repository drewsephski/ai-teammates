import { createClerkClient } from "@clerk/backend"
import { and, eq, gte, sql } from "drizzle-orm"

import { db } from "@/db"
import { usageEntries, type NewUsageEntry, type UsageKind } from "@/db/schema"
import { accountPlan } from "@/lib/billing-policy"

// Not @clerk/nextjs: the Trigger.dev tasks meter usage too, outside Next.js
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })

export async function getAccountPlan(userId: string) {
  try {
    const subscription = await clerk.billing.getUserBillingSubscription(userId)
    return accountPlan(subscription.subscriptionItems)
  } catch (error) {
    // Clerk may not have created the default free subscription yet. Other
    // provider failures must not silently downgrade a paid user's allowance.
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 404
    )
      return accountPlan([])
    throw error
  }
}

// Free credit is lifetime usage, so deleting bots, reconnecting apps, or
// switching plans cannot reset the starter allowance.
export async function getUsage(userId: string) {
  const plan = await getAccountPlan(userId)
  const { period, limits } = plan

  const rows = await db
    .select({
      kind: usageEntries.kind,
      amount: sql`sum(${usageEntries.amount})`.mapWith(Number),
    })
    .from(usageEntries)
    .where(
      and(
        eq(usageEntries.userId, userId),
        period.start ? gte(usageEntries.createdAt, period.start) : undefined
      )
    )
    .groupBy(usageEntries.kind)

  const used: Record<UsageKind, number> = { ai: 0, sandbox: 0 }
  for (const row of rows) used[row.kind] = row.amount

  return {
    ...plan,
    used,
    remaining: {
      ai: Math.max(0, limits.ai - used.ai),
      sandbox: Math.max(0, limits.sandbox - used.sandbox),
    },
  }
}

export type Usage = NonNullable<Awaited<ReturnType<typeof getUsage>>>

// Adds to the ledger. An entry whose key is already there is left out.
export async function recordUsage(entries: NewUsageEntry[]) {
  if (entries.length === 0) return

  await db
    .insert(usageEntries)
    .values(entries)
    .onConflictDoNothing({ target: usageEntries.idempotencyKey })
}
