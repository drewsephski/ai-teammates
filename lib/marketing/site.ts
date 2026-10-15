import { planLimits } from "@/lib/billing-policy"

export const siteUrl = "https://kraftybot.app"
export const brandName = "Krafty"
export const productName = "Krafty Bot"
export const tagline = "AI teammates you can give real work to"
export const siteTitle = `${brandName} — ${tagline}`
export const siteDescription =
  "AI teammates with their own memory and cloud computer. Create your team, connect your tools, and get finished work back, even with your browser closed."
export const socialImage = {
  url: "/brand/krafty-social-v1.jpg",
  width: 1200,
  height: 630,
  alt: "Krafty — AI teammates you can give real work to. An ivory sculptural bot on a charcoal backdrop.",
}

/**
 * Bump when the public marketing pages change meaningfully so the sitemap's
 * lastmod stays honest.
 */
export const marketingUpdated = "2026-10-14"

const usd = (millionths: number) => millionths / 1_000_000

/** Public plan summary. Limits come from billing-policy so copy can't drift. */
export const publicPlans = [
  {
    name: "Free",
    price: 0,
    period: null,
    summary: "Try Krafty with one teammate.",
    features: [
      `${planLimits.free.bots} bot`,
      `${planLimits.free.apps} connected app`,
      `One-time $${usd(planLimits.free.ai)} AI allowance`,
      "Built-in web research",
    ],
  },
  {
    name: "Pro",
    price: 20,
    period: "month",
    summary: "A full team with cloud computers.",
    features: [
      `Up to ${planLimits.paid.bots} bots`,
      "Unlimited connected apps",
      `$${usd(planLimits.paid.ai)} AI allowance each billing period`,
      `${planLimits.paid.sandbox / 3600} hours of cloud computer time each billing period`,
      "Persistent computers, memory, and group chats",
    ],
  },
] as const
