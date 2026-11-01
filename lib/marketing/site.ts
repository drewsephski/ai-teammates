import { planCount, planLimits, PRO_TRIAL_DAYS } from "@/lib/billing-policy"
import { ROUTINE_LIMITS } from "@/lib/routine-policy"

export const siteUrl = "https://kraftybot.app"
export const brandName = "Krafty"
export const productName = "Krafty Bot"
// Forwards to the founder's inbox; the one address every page and email shows
export const supportEmail = "support@kraftybot.app"
export const tagline = "AI that does the work"
export const siteTitle = `${brandName} — ${tagline}`
export const siteDescription =
  "Tell Krafty what you need done. Its Bots research the web, work in your apps and on a cloud computer, run tasks on a schedule, and ask before sending anything."
export const socialImage = {
  url: "/brand/krafty-social-v1.jpg",
  width: 1200,
  height: 630,
  alt: "Krafty, AI teammates you can hand a job to. An ivory bot figure on a charcoal background.",
}

/**
 * Krafty's own profiles on other sites (X, LinkedIn, Product Hunt, directory
 * listings). They become the Organization's `sameAs`, which tells search
 * engines and AI answers that those profiles and this site are one entity, so
 * Krafty Bot isn't confused with similarly named products. List only live
 * profiles that Krafty controls.
 */
export const brandProfiles: readonly string[] = [
  "https://www.linkedin.com/company/kraftybot/",
]

/**
 * The founder's own profiles, the Person's `sameAs`. Kept apart from
 * brandProfiles because they identify Drew, not Krafty.
 */
export const founderProfiles: readonly string[] = [
  "https://github.com/drewsephski",
  "https://www.instagram.com/drew.sepeczi/",
  "https://www.linkedin.com/in/drewsepeczi/",
  "https://x.com/SepecziDre72128",
]

/** Where Krafty is based, for the Organization's address. */
export const brandLocation = {
  addressLocality: "Chicago",
  addressRegion: "IL",
  addressCountry: "US",
} as const

/**
 * Bump when the public marketing pages change meaningfully so the sitemap's
 * lastmod stays honest.
 */
export const marketingUpdated = "2026-11-01"

/**
 * Where a "Create this Bot" link on a public page goes. The workspace opens a
 * preview of the template (lib/bot-templates.ts), after sign-up when signed out.
 */
export function createBotHref(templateId: string, isAuthenticated: boolean) {
  const destination = `/workspace?create=${encodeURIComponent(templateId)}`
  return isAuthenticated
    ? destination
    : `/sign-up?redirect_url=${encodeURIComponent(destination)}`
}

const free = planLimits.free
const paid = planLimits.paid

/** The free plan's computer time each month, in minutes. */
export const freeComputerMinutes = free.sandbox / 60

/** Pro's free trial, as a phrase: "7-day free trial". */
export const proTrial = `${PRO_TRIAL_DAYS}-day free trial`

/**
 * What the free plan includes, as one phrase for sentences. Derived from
 * billing-policy so the pages can't drift from the limits.
 */
export const freePlanIncludes = `${planCount(free.bots, "bot")}, ${planCount(free.apps, "connected app")} and ${planCount(ROUTINE_LIMITS.free, "routine")}, with AI usage and ${freeComputerMinutes} minutes of computer time that renew every month`

/** What Pro includes, as one phrase for sentences. */
export const proPlanIncludes = `up to ${paid.bots} bots, unlimited connected apps, up to ${ROUTINE_LIMITS.paid} routines, and ${paid.sandbox / 3600} hours of cloud computer time each billing period`

/** Both plans in two sentences, for pages that answer "what does it cost?". */
export const plansSentence = `The free plan includes ${freePlanIncludes}. Pro is $20 a month for ${proPlanIncludes}, and it starts with a ${proTrial}.`

/** Public plan summary. Limits come from billing-policy so copy can't drift. */
export const publicPlans = [
  {
    name: "Free",
    price: 0,
    period: null,
    summary: "Put Bots to work for free, every month.",
    features: [
      `${free.bots} bots`,
      `${free.apps} connected apps`,
      `${ROUTINE_LIMITS.free} routines`,
      "AI usage that renews every month",
      `${freeComputerMinutes} minutes of computer time each month`,
      "Built-in web research",
    ],
  },
  {
    name: "Pro",
    price: 20,
    period: "month",
    summary: `Start with a ${proTrial}. More Bots, more apps, and hours of computer time.`,
    features: [
      `Up to ${paid.bots} bots`,
      "Unlimited connected apps",
      `Up to ${ROUTINE_LIMITS.paid} routines`,
      "More AI usage, renewed each billing period",
      `${paid.sandbox / 3600} hours of cloud computer time each billing period`,
      "Persistent computers, memory, and group chats",
    ],
  },
] as const
