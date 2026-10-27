import type { Metadata } from "next"

import { planLimits } from "@/lib/billing-policy"
import { ROUTINE_LIMITS } from "@/lib/routine-policy"
import { formatBudget, LOOP_STEP_LIMIT, TASK_BUDGETS } from "@/lib/turn-spend"
import { EVENT_RUNS_PER_DAY } from "@/lib/routine-events"
import {
  brandName,
  freePlanIncludes,
  productName,
  siteUrl,
  socialImage,
} from "./site"

// Plain statements about the product, shared by the public pages, llms.txt and
// structured data so search engines and AI answers read one consistent story.
// Every line here must stay true of the code; check docs/autonomy.md and
// lib/billing-policy.ts before changing one.

/** Answer-first definition, about 60 words, for "what is Krafty Bot". */
export const definition = `${productName} is an AI workspace where you hand Bots actual tasks, not just questions. Each Bot has its own memory and working instructions, and all the Bots on your account share one persistent cloud computer with a desktop and browser. Bots use the apps you connect, research the web, run routines on a schedule, and keep working after you close your browser.`

/** One-line definition for the home page, beside the full `definition`. */
export const definitionShort =
  "You tell a Bot what you need done. It works through the steps in your apps and on a cloud computer, keeps going after you log off, and checks with you before anything goes out."

/** Each step's `summary` is its one-line version for the home page. */
export const howItWorks = [
  {
    title: "Describe the job",
    summary: "Tell a Bot what you need. A few questions and it’s set up.",
    body: "Create a Bot and tell it what you need. It asks a few setup questions, then saves its name, role, and working instructions.",
  },
  {
    title: "Connect the apps it needs",
    summary: "You sign in yourself, and can disconnect any time.",
    body: "The first time a task needs an app, the Bot asks you to connect it. You sign in yourself, and you can disconnect an app at any time.",
  },
  {
    title: "Let it work",
    summary: "It works in your apps and on its own computer.",
    body: "The Bot works in your apps and on its cloud computer, alone or with other Bots in a group chat. Ask it to repeat the job and it saves a routine that runs on a schedule.",
  },
  {
    title: "Review and approve",
    summary: "Changes to your connected apps wait for your OK.",
    body: "When the Bot finishes, has a question, or wants to change something in a connected app, it tells you in the chat and on your Activity page. Changes wait for your approval.",
  },
] as const

export const capabilities = [
  {
    id: "memory",
    title: "Its own memory",
    body: "Bots save notes to memory and recall them in any chat. Memory is separate from chat history, so tell a Bot what is worth remembering.",
  },
  {
    id: "computer",
    title: "A shared cloud computer",
    body: "Each account has one persistent cloud computer with a desktop and browser, shared by all its Bots. Files and browser sign-ins carry over from one Bot to the next. The computer pauses when idle and resumes when a Bot needs it.",
  },
  {
    id: "apps",
    title: "Your connected apps",
    body: "Bots find apps in a searchable catalog, such as Gmail, Google Sheets, Slack, and Notion, and use them through the account you connect. Sites without a connection can be used in the computer's browser.",
  },
  {
    id: "research",
    title: "Web research",
    body: "Bots search the web and read pages to answer questions and gather sources, with the searches counted against your plan's allowance.",
  },
  {
    id: "routines",
    title: "Routines on a schedule",
    body: `Bots run work daily, every few hours, or once at a set time, in your timezone, or each time something happens in a connected app, such as a new email or Slack message (up to ${EVENT_RUNS_PER_DAY} runs a day). The free plan includes ${ROUTINE_LIMITS.free} routine and Pro up to ${ROUTINE_LIMITS.paid}.`,
  },
  {
    id: "teams",
    title: "Group chats and handoffs",
    body: "Put several Bots in one chat and they pass work between themselves. A Bot can also brief a teammate and pick up the result.",
  },
] as const

/** What waits for the person. Mirrors "What is enforced" in docs/autonomy.md. */
export const safeguards = [
  "Reading your connected apps needs no approval. Anything that writes to them, such as sending, posting, or updating a record, is held until you approve it, unless you have chosen to always allow that action for that Bot. When you approve, the exact action you saw runs right away.",
  "A plain email a Bot sends only to an address you verified on your Krafty account, such as a routine's report, goes out without asking, up to three per reply.",
  "High-risk app actions can never be set to always allow.",
  "On the cloud computer, a separate model checks each click and keypress against a screenshot, and steps that commit something run only after you approve them.",
  "Approval requests expire after seven days. Nothing in a web page, email, or document can approve an action; only you can.",
] as const

/** What a task costs and how it's capped. Mirrors "Spend" in docs/autonomy.md. */
export const spendControls = [
  "On the web, each reply shows what it used of your AI allowance, including web searches.",
  `You can give each Bot a spend limit per task (${TASK_BUDGETS.map(formatBudget).join(", ")}). The Bot stops after the step that reaches it, and you reply to keep going. Computer time is metered separately.`,
  `A reply that takes the same step with the same result ${LOOP_STEP_LIMIT} times in a row is stopped, and the AI allowance the repeats used is given back.`,
  "A reply that ends in an error, for example when a model provider fails partway, gets back the AI allowance it used.",
] as const

/** Honest limits, so answers about the product don't overstate it. */
export const limitations = [
  "Bots don't remember everything automatically. They keep the notes you ask them to save.",
  "A task can stop early when you reach your usage allowance or step limit, or when a provider is down.",
  "The approval check on the computer is a model reading the screen. It reduces risk; it can't remove it.",
  `The free plan is for trying ${brandName}: ${freePlanIncludes}.`,
] as const

/** How Krafty differs from the tools people compare it with. No competitor claims. */
export const comparisons = [
  {
    title: "Compared with a chat assistant",
    body: "A chat assistant answers in a chat window while you watch. A Bot works in your apps and on its own computer, keeps going after you close the browser, and brings back finished work.",
  },
  {
    title: "Compared with workflow automation",
    body: "Automation tools run the exact steps you wire up ahead of time. You describe the job to a Bot in plain language, and it works out the steps, uses a browser when there's no integration, and asks you when something is unclear.",
  },
] as const

export const usd = (millionths: number) => millionths / 1_000_000

/** Pricing as plain sentences, for llms.txt and answers. */
export const pricingFacts = [
  `Free: ${freePlanIncludes}.`,
  `Pro: $20 per month for up to ${planLimits.paid.bots} bots, unlimited connected apps, a $${usd(planLimits.paid.ai)} AI allowance, and ${planLimits.paid.sandbox / 3600} hours of cloud computer time each billing period.`,
  "People who sign in with their ChatGPT plan can run their Bots' model calls on that plan instead of the AI allowance.",
] as const

/**
 * Metadata for a public page: canonical, and Open Graph and Twitter tags that
 * keep the social image, since a page-level `openGraph` replaces the root one.
 */
export function pageMetadata({
  path,
  title,
  description,
}: {
  path: string
  title: string
  description: string
}): Metadata {
  const fullTitle = `${title} · ${brandName}`
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      url: path,
      title: fullTitle,
      description,
      siteName: brandName,
      type: "website",
      locale: "en_US",
      images: [{ ...socialImage, type: "image/jpeg" }],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [{ url: socialImage.url, alt: socialImage.alt }],
    },
  }
}

export const absoluteUrl = (path: string) => new URL(path, siteUrl).href

/** BreadcrumbList for a visible breadcrumb trail. */
export function breadcrumbJsonLd(trail: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  }
}
