import type { Metadata } from "next"
import Link from "next/link"
import localFont from "next/font/local"
import { auth } from "@clerk/nextjs/server"
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  GlobeIcon,
  MonitorIcon,
} from "lucide-react"

import { BotMark } from "@/components/landing/bot/bot-mark"
import { BotNavigation } from "@/components/landing/bot/navigation"
import { BotChatDemo } from "@/components/landing/bot/chat-demo"
import { BotFeatures } from "@/components/landing/bot/features"
import { RoleShowcase } from "@/components/landing/bot/role-showcase"
import { BotFaq } from "@/components/landing/bot/faq"
import { HowItWorksSteps } from "@/components/landing/bot/how-it-works-steps"
import { GetStartedButton } from "@/components/landing/bot/get-started-button"
import { LandingPricing } from "@/components/landing/pricing"
import { HalftoneWordmark } from "@/components/landing/halftone-wordmark-footer"
import styles from "@/components/landing/bot/bot-landing.module.css"
import { JsonLd } from "@/components/json-ld"
import { homeJsonLd } from "@/lib/marketing/json-ld"
import { definitionShort } from "@/lib/marketing/content"
import {
  brandName,
  freePlanIncludes,
  siteDescription,
  socialImage,
} from "@/lib/marketing/site"

const botFont = localFont({
  src: "../public/landing/bot/display.woff2",
  variable: "--font-bot",
  weight: "200 800",
  display: "swap",
})

const homeTitle =
  "Krafty — AI teammates with memory, apps, and a cloud computer"
const homeDescription = siteDescription

export const metadata: Metadata = {
  title: { absolute: homeTitle },
  description: homeDescription,
  alternates: { canonical: "/" },
  openGraph: {
    url: "/",
    title: homeTitle,
    description: homeDescription,
    siteName: brandName,
    type: "website",
    locale: "en_US",
    images: [{ ...socialImage, type: "image/jpeg" }],
  },
}

export default async function LandingPage() {
  const { isAuthenticated } = await auth()
  const appHref = (destination: string) =>
    isAuthenticated
      ? destination
      : `/sign-in?redirect_url=${encodeURIComponent(destination)}`
  const workspaceHref = appHref("/workspace")
  const plansHref = isAuthenticated ? "/pricing" : "#pricing"
  const startHref = isAuthenticated
    ? "/workspace"
    : "/sign-up?redirect_url=%2Fworkspace"

  return (
    <div className={`${styles.landing} ${botFont.variable}`} id="top">
      <JsonLd data={homeJsonLd()} />
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <BotNavigation workspaceHref={workspaceHref} />
      <main id="main">
        <section
          className={`${styles.container} ${styles.hero}`}
          aria-labelledby="hero-title"
        >
          <Link
            href={workspaceHref}
            prefetch={false}
            className={styles.announcement}
          >
            <strong>Krafty Bot is here</strong>
            <span className={styles.announcementExtra}>
              · Meet your teammates
            </span>
            <ArrowUpRightIcon />
          </Link>
          <h1 id="hero-title" className={styles.heroTitle}>
            <span className={styles.heroTitlePrimary}>AI teammates</span>
            <span className={styles.heroTitleBrand}>
              <BotMark
                className={styles.heroMark}
                color="#efe7dc"
                sequence="hero"
                dimensional
              />
              Krafty Bot
            </span>
          </h1>
          <p className={styles.heroCopy}>
            They use your tools and bring back finished work.
          </p>
          <div className={styles.actions}>
            <GetStartedButton href={startHref} />
            <a href="#pricing" className={styles.secondaryButton}>
              View plans
            </a>
          </div>
          <div className={styles.heroPreview}>
            <BotChatDemo workspaceHref={workspaceHref} />
          </div>
        </section>
        <section
          id="what-is-krafty-bot"
          className={`${styles.container} ${styles.section} ${styles.explain}`}
          aria-labelledby="what-is-title"
        >
          <div className={styles.explainIntro}>
            <h2 id="what-is-title">What is Krafty Bot?</h2>
            <p className={styles.explainLede}>{definitionShort}</p>
            <Link href="/how-it-works" className={styles.textLink}>
              See how it works <ArrowRightIcon size={16} />
            </Link>
          </div>
          <HowItWorksSteps />
        </section>
        <BotFeatures />
        <RoleShowcase workspaceHref={workspaceHref} />
        <section
          id="pricing"
          className={`${styles.container} ${styles.section} ${styles.pricing}`}
          aria-labelledby="pricing-title"
        >
          <div className={styles.centerHeading}>
            <h2 id="pricing-title">Pricing</h2>
          </div>
          <div className={styles.plans}>
            <LandingPricing />
          </div>
          <p className={styles.pricingNote}>
            Founding offer: the first 50 new Pro subscribers can use code{" "}
            <strong>FOUNDING50</strong> for $8/month instead of $20/month while
            their subscription stays on that plan. Start free with{" "}
            {freePlanIncludes}. Hours of computer time require a paid plan.{" "}
            <Link href={appHref("/usage")} prefetch={false}>
              View your usage <ArrowUpRightIcon size={13} className="inline" />
            </Link>
          </p>
        </section>
        <section
          id="access"
          className={`${styles.container} ${styles.section} ${styles.split}`}
          aria-labelledby="access-title"
        >
          <div className={styles.splitCopy}>
            <h2 id="access-title">Open Krafty Bot</h2>
            <p>The same team on your laptop and your phone.</p>
          </div>
          <div className={styles.accessCards}>
            <Link
              className={styles.accessCard}
              href={workspaceHref}
              prefetch={false}
            >
              <GlobeIcon />
              <span>
                Open the app<small>Desktop and mobile browsers</small>
              </span>
              <ArrowUpRightIcon />
            </Link>
            <Link
              className={styles.accessCard}
              href={startHref}
              prefetch={false}
            >
              <MonitorIcon />
              <span>
                {isAuthenticated ? "Meet your teammates" : "Create your team"}
                <small>Your own AI workspace</small>
              </span>
              <ArrowUpRightIcon />
            </Link>
          </div>
        </section>
        <section
          className={`${styles.container} ${styles.section} ${styles.guides}`}
          aria-labelledby="explore-title"
        >
          <h2 id="explore-title">Make Krafty Bot your own</h2>
          <p>
            Give each teammate a role and bring them into the work you already
            do every day.
          </p>
          <Link
            href={workspaceHref}
            prefetch={false}
            className={styles.secondaryButton}
          >
            Explore your workspace <ArrowRightIcon size={16} />
          </Link>
        </section>
        <section
          id="faqs"
          className={`${styles.container} ${styles.section} ${styles.split}`}
          aria-labelledby="faq-title"
        >
          <h2 id="faq-title">FAQs</h2>
          <BotFaq />
        </section>
        <section
          className={`${styles.container} ${styles.final}`}
          aria-labelledby="get-started-title"
        >
          <h2 id="get-started-title">Meet your first Bot</h2>
          <p>Start free and give it something real to do</p>
          <div className={styles.actions}>
            <Link href={startHref} prefetch={false} className={styles.button}>
              Get started
            </Link>
            <a href="#pricing" className={styles.secondaryButton}>
              View plans
            </a>
          </div>
          <BotMark
            className={styles.giantMark}
            color="#efe7dc"
            sequence="footer"
            dimensional
          />
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerGrid}>
          <div className={styles.footerIntro}>
            <Link href="/" className={styles.footerBrand}>
              Krafty
            </Link>
            <span>© {new Date().getFullYear()} Krafty</span>
          </div>
          <div className={styles.footerColumn}>
            <p className={styles.footerHeading}>Product</p>
            <Link href={workspaceHref} prefetch={false}>
              Workspace
            </Link>
            <a href="#features">Features</a>
            <Link href="/how-it-works">How it works</Link>
            <Link href="/use-cases">Use cases</Link>
            <Link href="/ai-agents-for-business">For business</Link>
            <Link href="/ai-employees">AI employees</Link>
            <a href="#pricing">Pricing</a>
          </div>
          <div className={styles.footerColumn}>
            <p className={styles.footerHeading}>Krafty Bot</p>
            <a href="#top">Overview</a>
            <Link href={workspaceHref} prefetch={false}>
              Your teammates
            </Link>
            <a href="#faqs">FAQs</a>
          </div>
          <div className={styles.footerColumn}>
            <p className={styles.footerHeading}>Your account</p>
            <Link href={workspaceHref} prefetch={false}>
              Open app
            </Link>
            <Link href={plansHref} prefetch={false}>
              Plans
            </Link>
            <Link href={appHref("/usage")} prefetch={false}>
              Usage
            </Link>
            {!isAuthenticated && (
              <Link href={startHref} prefetch={false}>
                Create account
              </Link>
            )}
          </div>
        </div>
        <div className={styles.footerBottom}>
          <span>AI teammates with a memory and a computer of their own.</span>
          <div className="flex flex-wrap gap-4">
            <Link href="/support">Support</Link>
            <Link href="/privacy">Privacy policy</Link>
            <Link href="/terms">Terms of service</Link>
            <a href="#top">Back to top ↑</a>
          </div>
        </div>
        <HalftoneWordmark appearance="dark" className={styles.footerWordmark} />
      </footer>
    </div>
  )
}
