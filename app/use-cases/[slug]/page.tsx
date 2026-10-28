import type { CSSProperties } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import localFont from "next/font/local"
import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"

import { BotNavigation } from "@/components/landing/bot/navigation"
import { Breadcrumbs } from "@/components/landing/bot/breadcrumbs"
import { PageFooter } from "@/components/landing/bot/page-footer"
import styles from "@/components/landing/bot/bot-landing.module.css"
import { JsonLd } from "@/components/json-ld"
import {
  absoluteUrl,
  breadcrumbJsonLd,
  pageMetadata,
} from "@/lib/marketing/content"
import { marketingUpdated, siteUrl } from "@/lib/marketing/site"
import { faqPageJsonLd } from "@/lib/marketing/json-ld"
import { roleWalkthroughFor } from "@/lib/marketing/role-walkthroughs"
import { RoleWalkthroughPlayer } from "@/components/role-walkthrough-player"
import { CopyPrompt } from "../copy-prompt"
import { useCaseGuides } from "../use-case-guides"
import { findUseCase, useCases, type UseCase } from "../use-cases-data"
import cards from "../use-cases.module.css"
import page from "./use-case.module.css"

const botFont = localFont({
  src: "../../../public/landing/bot/display.woff2",
  variable: "--font-bot",
  weight: "200 800",
  display: "swap",
})

type Props = { params: Promise<{ slug: string }> }

export const dynamicParams = false

export function generateStaticParams() {
  return useCases.map((useCase) => ({ slug: useCase.id }))
}

// The summary's first sentence is short enough for a search snippet.
const metaDescription = (useCase: UseCase) =>
  useCase.summary.split(/(?<=\.)\s/)[0]

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const useCase = findUseCase((await params).slug)
  if (!useCase) return {}
  return pageMetadata({
    path: `/use-cases/${useCase.id}`,
    title: useCase.headline,
    description: metaDescription(useCase),
  })
}

// Three other roles, starting after this one, so every page links onward.
function related(useCase: UseCase) {
  const index = useCases.indexOf(useCase)
  return [1, 2, 3].map((step) => useCases[(index + step) % useCases.length])
}

export default async function UseCasePage({ params }: Props) {
  const useCase = findUseCase((await params).slug)
  if (!useCase) notFound()

  const { isAuthenticated } = await auth()
  const workspaceHref = isAuthenticated
    ? "/workspace"
    : `/sign-in?redirect_url=${encodeURIComponent("/workspace")}`
  const startHref = isAuthenticated
    ? "/workspace"
    : "/sign-up?redirect_url=%2Fworkspace"
  const guide = useCaseGuides[useCase.id]
  const walkthrough = roleWalkthroughFor(useCase.id)
  const path = `/use-cases/${useCase.id}`
  const trail = [
    { name: "Home", path: "/" },
    { name: "Use cases", path: "/use-cases" },
    { name: useCase.name, path },
  ]

  return (
    <div
      className={`${styles.landing} ${botFont.variable}`}
      id="top"
      style={{ "--role-color": useCase.color } as CSSProperties}
    >
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebPage",
              "@id": `${absoluteUrl(path)}#page`,
              url: absoluteUrl(path),
              name: useCase.headline,
              description: useCase.summary,
              dateModified: marketingUpdated,
              isPartOf: { "@id": `${siteUrl}/#website` },
              about: { "@id": `${siteUrl}/#app` },
              breadcrumb: breadcrumbJsonLd(trail),
            },
            faqPageJsonLd(guide.faqs, `${absoluteUrl(path)}#faq`),
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
          <p className={page.eyebrow}>{useCase.name} Bot</p>
          <h1>{useCase.headline}</h1>
          <p className={page.lead}>{useCase.summary}</p>
          <div className={styles.actions}>
            <Link href={startHref} prefetch={false} className={styles.button}>
              Create this Bot free
            </Link>
            <Link href="/how-it-works" className={styles.secondaryButton}>
              How Krafty works
            </Link>
          </div>
        </header>

        {walkthrough && (
          <section className={page.section} aria-labelledby="walkthrough-title">
            <h2 id="walkthrough-title">{walkthrough.title}</h2>
            <RoleWalkthroughPlayer
              slug={walkthrough.slug}
              title={walkthrough.title}
            />
            <p className={page.note}>
              Animated example with sample data. No external actions are
              performed. Playback starts muted; use the video controls for
              sound.
            </p>
            <ol className={page.steps} aria-label="Walkthrough transcript">
              {walkthrough.transcript.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        )}

        <section className={page.section} aria-labelledby="steps-title">
          <h2 id="steps-title">What the Bot does</h2>
          <ol className={page.steps}>
            {useCase.steps.map((step) => (
              <li key={step}>{step}.</li>
            ))}
          </ol>
        </section>

        <section className={page.section} aria-labelledby="approval-title">
          <h2 id="approval-title">What waits for you</h2>
          <ul className={page.list}>
            {useCase.waitsForYou.map((item) => (
              <li key={item}>{item}.</li>
            ))}
          </ul>
          <p className={page.note}>
            Reading your apps needs no approval. Anything that writes to them
            waits for you.{" "}
            <Link href="/how-it-works#approvals">How approvals work</Link>
          </p>
        </section>

        <section className={page.section} aria-labelledby="first-run-title">
          <h2 id="first-run-title">Your first run</h2>
          <ol className={page.steps}>
            {guide.firstRun.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <section className={page.section} aria-labelledby="output-title">
          <h2 id="output-title">What comes back</h2>
          <figure className={page.sample} data-nosnippet>
            <figcaption>
              <span className={page.sampleTitle}>
                {guide.sampleOutput.title}
              </span>
              <span className={page.sampleLabel}>
                {guide.sampleOutput.label}
              </span>
            </figcaption>
            <ul>
              {guide.sampleOutput.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </figure>
        </section>

        <section className={page.section} aria-labelledby="setup-title">
          <h2 id="setup-title">Apps and schedule</h2>
          <p>
            This starter prompt uses {useCase.apps.length} connected apps and
            needs Pro. To try the free plan, narrow it to one connected app.{" "}
            <Link href="/#pricing">Compare plan limits</Link>.
          </p>
          <dl className={page.facts}>
            <div>
              <dt>Apps in the starter prompt</dt>
              <dd>{useCase.apps.join(", ")}</dd>
            </div>
            <div>
              <dt>When it runs</dt>
              <dd>{useCase.schedule}</dd>
            </div>
          </dl>
          <p className={page.note}>
            You connect each app yourself, and the Bot asks for the ones it
            needs the first time it runs. A site without a connection can be
            opened in the Bot&apos;s browser on its cloud computer. Swap in the
            apps your team uses.
          </p>
        </section>

        <section className={page.section} aria-labelledby="prompt-title">
          <h2 id="prompt-title">Starter prompt</h2>
          <p className={page.note}>
            Paste this into a new Bot and edit the details to fit your work.
          </p>
          <div className={page.prompt}>
            <CopyPrompt prompt={useCase.prompt} />
          </div>
        </section>

        <section className={page.section} aria-labelledby="pitfalls-title">
          <h2 id="pitfalls-title">Where this job goes wrong</h2>
          <p>{guide.pitfalls}</p>
        </section>

        <section className={page.section} aria-labelledby="questions-title">
          <h2 id="questions-title">Questions about this role</h2>
          <dl className={page.questions}>
            {guide.faqs.map(([question, answer]) => (
              <div key={question}>
                <dt>{question}</dt>
                <dd>{answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={page.section} aria-labelledby="related-title">
          <h2 id="related-title">More jobs for a Bot</h2>
          <ul className={cards.grid}>
            {related(useCase).map((other) => (
              <li
                key={other.id}
                className={cards.card}
                style={{ "--role-color": other.color } as CSSProperties}
              >
                <h3>
                  <Link href={`/use-cases/${other.id}`}>{other.headline}</Link>
                </h3>
                <p>{other.description}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <div className={styles.container}>
        <PageFooter />
      </div>
    </div>
  )
}
