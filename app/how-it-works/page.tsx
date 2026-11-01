import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import localFont from "next/font/local"
import { auth } from "@clerk/nextjs/server"
import { ArrowRightIcon, MinusIcon, PlusIcon } from "lucide-react"

import { ApprovalPlayground } from "@/components/landing/bot/approval-playground"
import { BotMark } from "@/components/landing/bot/bot-mark"
import { BotNavigation } from "@/components/landing/bot/navigation"
import { Breadcrumbs } from "@/components/landing/bot/breadcrumbs"
import { CapabilityExplorer } from "@/components/landing/bot/capability-explorer"
import { CompareToggle } from "@/components/landing/bot/compare-toggle"
import { FlowStepper } from "@/components/landing/bot/flow-stepper"
import { PageFooter } from "@/components/landing/bot/page-footer"
import styles from "@/components/landing/bot/bot-landing.module.css"
import { JsonLd } from "@/components/json-ld"
import {
  absoluteUrl,
  breadcrumbJsonLd,
  capabilities,
  comparisons,
  definition,
  definitionShort,
  howItWorks,
  limitations,
  pageMetadata,
  pricingFacts,
  safeguards,
  spendControls,
} from "@/lib/marketing/content"
import {
  marketingUpdated,
  productName,
  publicPlans,
  siteUrl,
} from "@/lib/marketing/site"
import page from "./how-it-works-page.module.css"

const botFont = localFont({
  src: "../../public/landing/bot/display.woff2",
  variable: "--font-bot",
  weight: "200 800",
  display: "swap",
})

const title = "How Krafty Bot works: AI teammates with a computer"
const description =
  "How Krafty Bot's AI teammates work: their own memory, a shared cloud computer, connected apps, routines, and approval before any change to your apps."
const trail = [
  { name: "Home", path: "/" },
  { name: "How it works", path: "/how-it-works" },
]

// Short headings for the accordions, one per line of `safeguards` and
// `spendControls` in lib/marketing/content.ts, in the same order.
const safeguardTitles = [
  "Changes to your apps wait for you",
  "Reports to your own address go out",
  "High-risk actions always ask",
  "Every computer click is checked",
  "Only you can approve",
]
const spendTitles = [
  "See what each reply used",
  "Set a spend limit per task",
  "Repeated steps stop on their own",
  "Failed replies give the allowance back",
]

export const metadata: Metadata = pageMetadata({
  path: "/how-it-works",
  title,
  description,
})

const updated = new Date(`${marketingUpdated}T12:00:00Z`).toLocaleDateString(
  "en-US",
  { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }
)

function Accordion({
  name,
  items,
}: {
  name: string
  items: { title: string; body: string }[]
}) {
  return (
    <div className={page.accordion}>
      {items.map((item, index) => (
        <details key={item.title} name={name} open={index === 0}>
          <summary>
            <span>{item.title}</span>
            <PlusIcon className={page.plus} size={18} aria-hidden />
            <MinusIcon className={page.minus} size={18} aria-hidden />
          </summary>
          <p>{item.body}</p>
        </details>
      ))}
    </div>
  )
}

export default async function HowItWorksPage() {
  const { isAuthenticated } = await auth()
  const workspaceHref = isAuthenticated
    ? "/workspace"
    : `/sign-in?redirect_url=${encodeURIComponent("/workspace")}`
  const startHref = isAuthenticated
    ? "/workspace"
    : "/sign-up?redirect_url=%2Fworkspace"

  return (
    <div className={`${styles.landing} ${botFont.variable}`} id="top">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebPage",
              "@id": `${siteUrl}/how-it-works#page`,
              url: absoluteUrl("/how-it-works"),
              name: title,
              description,
              dateModified: marketingUpdated,
              isPartOf: { "@id": `${siteUrl}/#website` },
              about: { "@id": `${siteUrl}/#app` },
              breadcrumb: breadcrumbJsonLd(trail),
            },
          ],
        }}
      />
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <BotNavigation workspaceHref={workspaceHref} />
      <main id="main">
        <header className={page.hero}>
          <div className={page.heroCrumbs}>
            <Breadcrumbs trail={trail} />
          </div>
          <h1>How {productName} works</h1>
          <p className={page.lead}>{definitionShort}</p>
          <div className={styles.actions}>
            <Link href={startHref} prefetch={false} className={styles.button}>
              Start free
            </Link>
            <Link href="/use-cases" className={styles.secondaryButton}>
              See use cases
            </Link>
          </div>
          <figure className={page.heroArt}>
            <Image
              src="/marketing/visuals/how-it-works/hero.webp"
              alt="A small cream computer glowing in the dark, with three rounded companions at its base"
              fill
              priority
              sizes="(max-width: 1280px) 100vw, 1232px"
              className={page.heroImage}
            />
          </figure>
          <p className={page.definition}>{definition}</p>
          <p className={page.updated}>Updated {updated}</p>
        </header>

        <section className={page.section} aria-labelledby="steps-title">
          <div className={page.heading}>
            <p className={page.eyebrow}>The loop</p>
            <h2 id="steps-title">From a message to finished work</h2>
          </div>
          <FlowStepper steps={howItWorks} />
        </section>

        <section className={page.section} aria-labelledby="has-title">
          <div className={page.heading}>
            <p className={page.eyebrow}>Built in</p>
            <h2 id="has-title">What every Bot has</h2>
          </div>
          <CapabilityExplorer capabilities={capabilities} />
        </section>

        <section
          id="approvals"
          className={`${page.section} ${page.split}`}
          aria-labelledby="approvals-title"
        >
          <div className={page.splitCopy}>
            <p className={page.eyebrow}>You stay in charge</p>
            <h2 id="approvals-title">What waits for your approval</h2>
            <Accordion
              name="safeguards"
              items={safeguards.map((body, index) => ({
                title: safeguardTitles[index] ?? `Safeguard ${index + 1}`,
                body,
              }))}
            />
          </div>
          <ApprovalPlayground />
        </section>

        <section className={page.section} aria-labelledby="compare-title">
          <div className={page.heading}>
            <p className={page.eyebrow}>The difference</p>
            <h2 id="compare-title">How it compares</h2>
          </div>
          <CompareToggle comparisons={comparisons} />
          <Link href="/ai-agent-vs-chatbot" className={page.centerLink}>
            AI agent vs chatbot, in depth{" "}
            <ArrowRightIcon size={14} aria-hidden />
          </Link>
        </section>

        <section className={page.section} aria-labelledby="pricing-title">
          <div className={page.heading}>
            <p className={page.eyebrow}>Pricing</p>
            <h2 id="pricing-title">What it costs</h2>
          </div>
          <div className={page.plans}>
            {publicPlans.map((plan) => (
              <article key={plan.name} className={page.plan}>
                <h3>{plan.name}</h3>
                <p className={page.price}>
                  ${plan.price}
                  {plan.period && <span>/{plan.period}</span>}
                </p>
                <p className={page.planSummary}>{plan.summary}</p>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <p className={page.planNote}>
            {pricingFacts[pricingFacts.length - 1]}{" "}
            <Link href="/#pricing" className={page.textLink}>
              Compare plans <ArrowRightIcon size={14} aria-hidden />
            </Link>
          </p>
          <div className={page.spend}>
            <h3 id="spend-title">How spend is capped</h3>
            <Accordion
              name="spend"
              items={spendControls.map((body, index) => ({
                title: spendTitles[index] ?? `Spend control ${index + 1}`,
                body,
              }))}
            />
          </div>
        </section>

        <section className={page.section} aria-labelledby="limits-title">
          <div className={page.heading}>
            <p className={page.eyebrow}>Honest limits</p>
            <h2 id="limits-title">What it doesn&apos;t do</h2>
          </div>
          <ul className={page.limits}>
            {limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className={page.final} aria-labelledby="start-title">
          <h2 id="start-title">Give your first Bot a job</h2>
          <p>Start free with one Bot and one connected app.</p>
          <div className={styles.actions}>
            <Link href={startHref} prefetch={false} className={styles.button}>
              Get started
            </Link>
          </div>
          <BotMark
            className={page.giantMark}
            color="#efe7dc"
            sequence="footer"
            dimensional
          />
        </section>
      </main>
      <div className={styles.container}>
        <PageFooter />
      </div>
    </div>
  )
}
