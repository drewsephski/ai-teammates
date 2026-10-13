import { LandingPricing } from "@/components/landing/pricing"
import type { Metadata } from "next"
import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import {
  BrainIcon,
  CheckIcon,
  MonitorIcon,
  RefreshCwIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react"

import { KraftyWordmark } from "@/components/krafty-wordmark"
import { ProductSections } from "@/components/landing/product-sections"
import { LandingFooter } from "@/components/landing/footer"
import { MobileNavigation } from "@/components/landing/mobile-navigation"
import { LandingFaq } from "@/components/landing/faq"
import { AnimatedArrow } from "@/components/ui/animated-arrow"
import { WorkspacePreview } from "@/components/landing/workspace-preview"
import styles from "@/components/landing/landing.module.css"

export const metadata: Metadata = {
  title: "Krafty — Give your ideas a teammate",
  description:
    "Build your AI team with custom roles, shared conversations, lasting memory, and cloud computers. Explore Krafty for research, writing, code review, planning, learning, and data analysis.",
  openGraph: {
    title: "Krafty — Give your ideas a teammate",
    description:
      "AI teammates with a role, a memory, and a computer of their own.",
    type: "website",
  },
}

export default async function LandingPage() {
  const { isAuthenticated } = await auth()
  const appHref = (destination: string) =>
    isAuthenticated
      ? destination
      : `/sign-in?redirect_url=${encodeURIComponent(destination)}`
  const startHref = isAuthenticated
    ? "/workspace"
    : "/sign-up?redirect_url=%2Fworkspace"

  return (
    <div id="top" tabIndex={-1} className={styles.landing}>
      <a href="#main" className={styles.skipLink}>
        Skip to content
      </a>
      <header className={styles.header}>
        <div className={styles.nav}>
          <KraftyWordmark />
          <nav className={styles.desktopNav} aria-label="Main navigation">
            <a href="#features">Features</a>
            <a href="#use-cases">Use cases</a>
            <a href="#how-it-works">How it works</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className={styles.navActions}>
            {!isAuthenticated && (
              <Link
                href={appHref("/workspace")}
                prefetch={false}
                className={styles.signIn}
              >
                Sign in
              </Link>
            )}
            <Link href={startHref} prefetch={false} className={styles.navCta}>
              {isAuthenticated ? "Open workspace" : "Get started"}
              <AnimatedArrow direction="diagonal" size={15} />
            </Link>
          </div>
          <MobileNavigation workspaceHref={appHref("/workspace")} />
        </div>
      </header>
      <main id="main">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Your own AI team</span>
            <h1 id="hero-title">
              Give your ideas
              <br />a teammate.
            </h1>
            <p>
              AI teammates with a role, a memory, and a computer. Create your
              team. Start a conversation. Get to work.
            </p>
            <div className={styles.heroActions}>
              <Link
                href={startHref}
                prefetch={false}
                className={styles.primaryButton}
              >
                {isAuthenticated ? "Open your workspace" : "Create your team"}{" "}
                <AnimatedArrow direction="right" size={17} />
              </Link>
              <a href="#use-cases" className={styles.secondaryButton}>
                Explore what’s possible{" "}
                <AnimatedArrow direction="down" size={15} />
              </a>
            </div>
            <div className={styles.heroNote}>
              <span>
                <CheckIcon size={13} /> Your roles, your instructions
              </span>
              <span>
                <CheckIcon size={13} /> Open source, made yours
              </span>
            </div>
          </div>
          <WorkspacePreview signedIn={isAuthenticated} />
        </section>
        <div
          className={styles.capabilityStrip}
          aria-label="Krafty capabilities"
        >
          <span>Made for real work</span>
          <p>
            <BrainIcon /> Lasting memory
          </p>
          <p>
            <MonitorIcon /> Cloud computers
          </p>
          <p>
            <UsersIcon /> Team handoffs
          </p>
          <p>
            <RefreshCwIcon /> Work that continues
          </p>
        </div>
        <ProductSections appHref={appHref} startHref={startHref} />
        <section
          id="pricing"
          className={`${styles.section} ${styles.pricing}`}
          aria-labelledby="pricing-title"
        >
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>Plans & usage</span>
              <h2 id="pricing-title">Choose a plan for your team.</h2>
            </div>
            <p>
              Choose from the available plans. Track your AI usage and active
              computer time in your workspace.
            </p>
          </div>
          <LandingPricing />
          <p className={styles.pricingNote}>
            Teammates and their cloud computers require a paid plan.{" "}
            <Link href={appHref("/usage")} prefetch={false}>
              Explore usage <AnimatedArrow size={13} />
            </Link>
          </p>
        </section>
        <section
          id="faq"
          className={`${styles.section} ${styles.faq}`}
          aria-labelledby="faq-title"
        >
          <div>
            <span className={styles.eyebrow}>A FEW GOOD QUESTIONS</span>
            <h2 id="faq-title">
              Before you
              <br />
              meet the team.
            </h2>
            <Link href={appHref("/pricing")} prefetch={false}>
              Explore plans <AnimatedArrow direction="right" size={15} />
            </Link>
          </div>
          <LandingFaq />
        </section>
        <section className={styles.finalCta}>
          <span className={styles.eyebrow}>
            <SparklesIcon size={15} /> MAKE ROOM FOR WHAT’S NEXT
          </span>
          <h2>
            Your next idea
            <br />
            has good company.
          </h2>
          <p>Build a team around the work you want to do.</p>
          <Link
            href={startHref}
            prefetch={false}
            className={styles.primaryButton}
          >
            Meet your first teammate{" "}
            <AnimatedArrow direction="right" size={17} />
          </Link>
          <small>
            Teammates and cloud computers are available on a paid plan.
          </small>
        </section>
      </main>
      <LandingFooter appHref={appHref} isAuthenticated={isAuthenticated} />
    </div>
  )
}
