import { planLimits, type PlanTier } from "@/lib/billing-policy"

// A plan read from Clerk is trusted for a minute. When Clerk fails, the last
// good read keeps working for six hours so a provider outage neither stops
// paid work nor turns quota enforcement off.
export const PLAN_FRESH_MS = 60_000
export const PLAN_STALE_MS = 6 * 3_600_000

export type AccountPlan = {
  tier: PlanTier
  period: { start: Date | null; end: Date | null }
  limits: (typeof planLimits)[PlanTier]
}

export type CachedPlan = {
  tier: PlanTier
  periodStart: Date | null
  periodEnd: Date | null
  checkedAt: Date
}

export function planFromCache(row: CachedPlan): AccountPlan {
  return {
    tier: row.tier,
    period: { start: row.periodStart, end: row.periodEnd },
    limits: planLimits[row.tier],
  } as AccountPlan
}

export function planToCache(plan: AccountPlan, now: Date): CachedPlan {
  return {
    tier: plan.tier,
    periodStart: plan.period.start,
    periodEnd: plan.period.end,
    checkedAt: now,
  }
}

// "fresh" is used as is; "stale" only when Clerk can't be reached.
// A paid period that has ended is never served from cache.
export function cachedPlanAge(row: CachedPlan | undefined, now: number) {
  if (!row) return "missing" as const
  if (row.tier === "paid" && row.periodEnd && row.periodEnd.getTime() <= now)
    return "missing" as const
  const age = now - row.checkedAt.getTime()
  if (age < 0) return "missing" as const
  if (age < PLAN_FRESH_MS) return "fresh" as const
  if (age < PLAN_STALE_MS) return "stale" as const
  return "missing" as const
}

export async function resolvePlan(options: {
  cached: CachedPlan | undefined
  now: number
  fetch: () => Promise<AccountPlan>
  save: (row: CachedPlan) => Promise<void>
  onStale?: (error: unknown) => void
}): Promise<AccountPlan> {
  const age = cachedPlanAge(options.cached, options.now)
  if (age === "fresh") return planFromCache(options.cached!)
  let plan: AccountPlan
  try {
    plan = await options.fetch()
  } catch (error) {
    if (age === "stale") {
      options.onStale?.(error)
      return planFromCache(options.cached!)
    }
    throw error
  }
  // A failed cache write must not fail the read that just succeeded
  await options.save(planToCache(plan, new Date(options.now))).catch(() => {})
  return plan
}
