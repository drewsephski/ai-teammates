import { planLimits } from "@/lib/billing-policy"

export const siteUrl = "https://kraftybot.app"
export const brandName = "Krafty"
export const productName = "Krafty Bot"
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
export const brandProfiles: readonly string[] = []

/**
 * Bump when the public marketing pages change meaningfully so the sitemap's
 * lastmod stays honest.
 */
export const marketingUpdated = "2026-10-28"

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

const usd = (millionths: number) => millionths / 1_000_000

/** The free plan's one-time computer time, in minutes. */
export const freeComputerMinutes = planLimits.free.sandbox / 60

/**
 * What the free plan includes, as one phrase for sentences. Derived from
 * billing-policy so the pages can't drift from the limits.
 */
export const freePlanIncludes = `one bot, one connected app, a one-time $${usd(planLimits.free.ai)} AI allowance, and ${freeComputerMinutes} minutes of computer time, once`

/** Public plan summary. Limits come from billing-policy so copy can't drift. */
export const publicPlans = [
  {
    name: "Free",
    price: 0,
    period: null,
    summary: "Try Krafty with one Bot.",
    features: [
      `${planLimits.free.bots} bot`,
      `${planLimits.free.apps} connected app`,
      `One-time $${usd(planLimits.free.ai)} AI allowance`,
      `${freeComputerMinutes} minutes of computer time, once`,
      "Built-in web research",
    ],
  },
  {
    name: "Pro",
    price: 20,
    period: "month",
    summary: "More Bots, more apps, and hours of computer time.",
    features: [
      `Up to ${planLimits.paid.bots} bots`,
      "Unlimited connected apps",
      `$${usd(planLimits.paid.ai)} AI allowance each billing period`,
      `${planLimits.paid.sandbox / 3600} hours of cloud computer time each billing period`,
      "Persistent computers, memory, and group chats",
    ],
  },
] as const
