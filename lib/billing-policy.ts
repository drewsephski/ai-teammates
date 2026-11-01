export const MAX_TEAMMATES = 50
export type PlanTier = "free" | "paid"
export const FREE_BOT_LIMIT_ERROR =
  "The free plan includes one bot. Upgrade to add more teammates."
// Legacy API error retained for older clients; deletion now cancels subscriptions.
export const ACTIVE_PLAN_ERROR =
  "Cancel your paid plan on kraftybot.app before deleting your account."
export const FREE_APP_LIMIT_ERROR =
  "The free plan includes one connected app. Disconnect your current app or upgrade to connect another."

// Free allowances are one-time: the free period has no start, so usage is
// summed over the account's whole life (lib/usage.ts). `sandbox` is seconds.
export const FREE_SANDBOX_SECONDS = 20 * 60

export const planLimits = {
  free: { ai: 1_000_000, sandbox: FREE_SANDBOX_SECONDS, bots: 1, apps: 1 },
  paid: {
    ai: 10_000_000,
    sandbox: 50 * 60 * 60,
    bots: MAX_TEAMMATES,
    apps: Infinity,
  },
} as const

type SubscriptionItem = {
  status: string
  periodStart: number
  periodEnd: number | null
  plan: { features: { slug: string }[] } | null
}

// Only a current subscription with computer access receives paid allowances.
// A canceled item retains access through its already-paid period.
export function accountPlan(items: SubscriptionItem[], now = Date.now()) {
  const paid = items.find(
    (item) =>
      (item.status === "active" || item.status === "canceled") &&
      item.periodStart <= now &&
      item.periodEnd !== null &&
      item.periodEnd > now &&
      item.plan?.features.some((feature) => feature.slug === "sandboxes")
  )
  return paid && paid.periodEnd !== null
    ? {
        tier: "paid" as const,
        period: {
          start: new Date(paid.periodStart),
          end: new Date(paid.periodEnd),
        },
        limits: planLimits.paid,
      }
    : {
        tier: "free" as const,
        period: { start: null, end: null },
        limits: planLimits.free,
      }
}

export function assertBotCapacity(tier: PlanTier, count: number) {
  if (count >= planLimits[tier].bots)
    throw new Error(
      tier === "free"
        ? FREE_BOT_LIMIT_ERROR
        : `Your team can have up to ${planLimits.paid.bots} bots.`
    )
}

export function assertAppCapacity(
  tier: PlanTier,
  accounts: { toolkit: string }[],
  toolkit: string
) {
  const apps = new Set(accounts.map((account) => account.toolkit))
  if (!apps.has(toolkit) && apps.size >= planLimits[tier].apps)
    throw new Error(FREE_APP_LIMIT_ERROR)
}

// Enforce the limit at tool discovery/execution too, including after downgrade.
export function allowedAppAccounts<T extends { toolkit: string }>(
  tier: PlanTier,
  accounts: T[]
) {
  const apps = [...new Set(accounts.map((account) => account.toolkit))].slice(
    0,
    planLimits[tier].apps
  )
  return accounts.filter((account) => apps.includes(account.toolkit))
}
