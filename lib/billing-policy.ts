export const MAX_TEAMMATES = 50
export type PlanTier = "free" | "paid"

// Pro's free trial, configured on the Pro plan in Clerk Billing (Dashboard →
// Billing → Plans → Pro → Free trial). Clerk collects a card, runs the trial
// as an active subscription item with isFreeTrial, and charges when it ends
// unless the person cancels. Keep this in step with the Clerk setting: the
// public pages quote it.
export const PRO_TRIAL_DAYS = 7

// Free allowances renew on the first of every month (UTC), like a billing
// period, so a free account never runs dry for good. `sandbox` is seconds.
export const FREE_SANDBOX_SECONDS = 20 * 60

export const planLimits = {
  free: { ai: 1_000_000, sandbox: FREE_SANDBOX_SECONDS, bots: 3, apps: 3 },
  paid: {
    ai: 10_000_000,
    sandbox: 50 * 60 * 60,
    bots: MAX_TEAMMATES,
    apps: Infinity,
  },
} as const

const words = ["zero", "one", "two", "three", "four", "five", "six", "seven"]

// "three": small counts spelled out for sentences
export const countWord = (count: number) => words[count] ?? String(count)

// "one bot", "three connected apps"
export function planCount(count: number, singular: string, plural?: string) {
  const noun = count === 1 ? singular : (plural ?? `${singular}s`)
  return `${countWord(count)} ${noun}`
}

// The upgrade sentence must stay separate and say "Krafty": installed iPhone
// builds drop such sentences by that wording (krafty-mobile
// src/lib/companion-policy.ts), and they can't update in step with the server.
export const FREE_BOT_LIMIT_ERROR = `The free plan includes ${planCount(planLimits.free.bots, "bot")}. Upgrade your Krafty plan to add more teammates.`
// Legacy API error retained for older clients; deletion now cancels subscriptions.
export const ACTIVE_PLAN_ERROR =
  "Cancel your paid plan on kraftybot.app before deleting your account."
export const FREE_APP_LIMIT_ERROR = `The free plan includes ${planCount(planLimits.free.apps, "connected app")}. Disconnect one to connect another. Upgrade your Krafty plan for more.`

// The free plan's current period: this calendar month, UTC
export function freePeriod(now = Date.now()) {
  const date = new Date(now)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  return {
    start: new Date(Date.UTC(year, month, 1)),
    end: new Date(Date.UTC(year, month + 1, 1)),
  }
}

type SubscriptionItem = {
  status: string
  periodStart: number
  periodEnd: number | null
  // A Pro trial: an active item whose period ends when the trial does
  isFreeTrial?: boolean
  plan: { features: { slug: string }[] } | null
}

// Only a current subscription with computer access receives paid allowances.
// A canceled item retains access through its already-paid period. A Pro
// trial is an active item whose period is the trial, so it gets Pro in full.
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
        period: freePeriod(now),
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
