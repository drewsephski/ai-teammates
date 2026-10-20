import type { Metadata } from "next"
import Link from "next/link"
import localFont from "next/font/local"
import { auth } from "@clerk/nextjs/server"

import { BotNavigation } from "@/components/landing/bot/navigation"
import { Breadcrumbs } from "@/components/landing/bot/breadcrumbs"
import { PageFooter } from "@/components/landing/bot/page-footer"
import styles from "@/components/landing/bot/bot-landing.module.css"
import { JsonLd } from "@/components/json-ld"
import {
  absoluteUrl,
  breadcrumbJsonLd,
  capabilities,
  comparisons,
  definition,
  howItWorks,
  limitations,
  pageMetadata,
  pricingFacts,
  safeguards,
} from "@/lib/marketing/content"
import { marketingUpdated, productName, siteUrl } from "@/lib/marketing/site"
import page from "./how-it-works.module.css"

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

export const metadata: Metadata = pageMetadata({
  path: "/how-it-works",
  title,
  description,
})

const updated = new Date(`${marketingUpdated}T12:00:00Z`).toLocaleDateString(
  "en-US",
  { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }
)

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
      <main id="main" className={styles.container}>
        <Breadcrumbs trail={trail} />
        <header className={page.header}>
          <h1>How {productName} works</h1>
          <p className={page.lead}>{definition}</p>
          <p className={page.updated}>Updated {updated}</p>
          <div className={styles.actions}>
            <Link href={startHref} prefetch={false} className={styles.button}>
              Start free
            </Link>
            <Link href="/use-cases" className={styles.secondaryButton}>
              See use cases
            </Link>
          </div>
        </header>

        <section className={page.section} aria-labelledby="steps-title">
          <h2 id="steps-title">From a message to finished work</h2>
          <ol className={page.steps}>
            {howItWorks.map((step) => (
              <li key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={page.section} aria-labelledby="has-title">
          <h2 id="has-title">What every Bot has</h2>
          <div className={page.grid}>
            {capabilities.map((capability) => (
              <article key={capability.id} id={capability.id}>
                <h3>{capability.title}</h3>
                <p>{capability.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          id="approvals"
          className={page.section}
          aria-labelledby="approvals-title"
        >
          <h2 id="approvals-title">What waits for your approval</h2>
          <ul className={page.list}>
            {safeguards.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className={page.section} aria-labelledby="compare-title">
          <h2 id="compare-title">How it compares</h2>
          <div className={page.grid}>
            {comparisons.map((comparison) => (
              <article key={comparison.title}>
                <h3>{comparison.title}</h3>
                <p>{comparison.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={page.section} aria-labelledby="limits-title">
          <h2 id="limits-title">What it doesn&apos;t do</h2>
          <ul className={page.list}>
            {limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className={page.section} aria-labelledby="pricing-title">
          <h2 id="pricing-title">What it costs</h2>
          <ul className={page.list}>
            {pricingFacts.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            <Link href="/#pricing" className={page.link}>
              Compare plans
            </Link>
          </p>
        </section>

        <section className={page.final} aria-labelledby="start-title">
          <h2 id="start-title">Give your first Bot a job</h2>
          <p>Start free with one Bot and one connected app.</p>
          <div className={styles.actions}>
            <Link href={startHref} prefetch={false} className={styles.button}>
              Get started
            </Link>
          </div>
        </section>
      </main>
      <div className={styles.container}>
        <PageFooter />
      </div>
    </div>
  )
}
