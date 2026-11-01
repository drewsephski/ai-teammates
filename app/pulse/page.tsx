import type { Metadata } from "next"
import Link from "next/link"
import localFont from "next/font/local"
import { auth } from "@clerk/nextjs/server"
import {
  CalendarIcon,
  CheckIcon,
  MailIcon,
  RepeatIcon,
  SheetIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react"

import { BotMark } from "@/components/landing/bot/bot-mark"
import { BotFaq } from "@/components/landing/bot/faq"
import { BotNavigation } from "@/components/landing/bot/navigation"
import { Breadcrumbs } from "@/components/landing/bot/breadcrumbs"
import { GetStartedButton } from "@/components/landing/bot/get-started-button"
import { PageFooter } from "@/components/landing/bot/page-footer"
import { PulsePreview } from "@/components/landing/bot/pulse-preview"
import styles from "@/components/landing/bot/bot-landing.module.css"
import pulse from "@/components/landing/bot/pulse.module.css"
import { CopyPrompt } from "@/app/use-cases/copy-prompt"
import { JsonLd } from "@/components/json-ld"
import { planLimits } from "@/lib/billing-policy"
import {
  absoluteUrl,
  breadcrumbJsonLd,
  pageMetadata,
} from "@/lib/marketing/content"
import { faqPageJsonLd } from "@/lib/marketing/json-ld"
import {
  pulseLoop,
  pulseName,
  pulsePage,
  pulsePrompt,
  pulseTemplateId,
} from "@/lib/marketing/pulse"
import { createBotHref, marketingUpdated, siteUrl } from "@/lib/marketing/site"

const botFont = localFont({
  src: "../../public/landing/bot/display.woff2",
  variable: "--font-bot",
  weight: "200 800",
  display: "swap",
})

export const metadata: Metadata = pageMetadata({
  path: pulsePage.path,
  title: pulsePage.title,
  description: pulsePage.description,
})

const trail = [
  { name: "Home", path: "/" },
  { name: pulseName, path: pulsePage.path },
]

const loopIcons: LucideIcon[] = [
  SheetIcon,
  TriangleAlertIcon,
  MailIcon,
  ShieldCheckIcon,
  RepeatIcon,
]

// Copy lives in lib/marketing/pulse.ts, which also feeds the Markdown copy and
// llms.txt; read sections from it instead of rewriting them here.
function section(id: string) {
  const found = pulsePage.sections.find((entry) => entry.id === id)
  if (!found) throw new Error(`Missing Pulse section ${id}`)
  return found
}

export default async function PulsePage() {
  const { isAuthenticated } = await auth()
  const workspaceHref = isAuthenticated
    ? "/workspace"
    : `/sign-in?redirect_url=${encodeURIComponent("/workspace")}`
  const createHref = createBotHref(pulseTemplateId, isAuthenticated)
  const pageUrl = absoluteUrl(pulsePage.path)

  const fit = section("fit")
  const loop = section("loop")
  const approvals = section("approvals")
  const plans = section("plans")
  const limits = section("limits")

  return (
    <div
      className={`${styles.landing} ${pulse.page} ${botFont.variable}`}
      id="top"
    >
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebPage",
              "@id": `${pageUrl}#page`,
              url: pageUrl,
              name: `${pulsePage.title} · Krafty`,
              description: pulsePage.description,
              dateModified: marketingUpdated,
              author: { "@id": `${siteUrl}/#founder` },
              isPartOf: { "@id": `${siteUrl}/#website` },
              about: { "@id": `${siteUrl}/#app` },
              breadcrumb: breadcrumbJsonLd(trail),
            },
            faqPageJsonLd(pulsePage.faqs, `${pageUrl}#faqs`),
          ],
        }}
      />
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <BotNavigation workspaceHref={workspaceHref} />
      <main id="main" className={styles.container}>
        <Breadcrumbs trail={trail} />

        <section className={pulse.hero} aria-labelledby="pulse-title">
          <p className={pulse.eyebrow}>
            <span className={pulse.eyebrowDot} aria-hidden />
            {pulseName} · For project managers
          </p>
          <h1 id="pulse-title" className={pulse.title}>
            <span>Keep your projects moving</span>
            <span className={pulse.titleQuiet}>
              from the sheet you already use
            </span>
          </h1>
          <p className={pulse.lead}>
            Connect your Google Sheets tracker. Pulse finds what&rsquo;s
            overdue, blocked or gone quiet, then drafts the follow-ups and the
            weekly status report. It asks before it changes a cell or emails
            anyone.
          </p>
          <div className={styles.actions}>
            <GetStartedButton
              href={createHref}
              label="Create your project coordinator"
            />
            <a href="#loop" className={styles.secondaryButton}>
              See the weekly loop
            </a>
          </div>
          <p className={pulse.worksWith}>
            Works with
            <span>
              <SheetIcon aria-hidden /> Google Sheets
            </span>
            <span>
              <MailIcon aria-hidden /> Gmail
            </span>
          </p>
        </section>

        <PulsePreview />

        <section id="fit" className={pulse.section} aria-labelledby="fit-title">
          <div className={pulse.split}>
            <div className={pulse.sectionHead}>
              <p className={pulse.kicker}>No new tool to roll out</p>
              <h2 id="fit-title">{fit.title}</h2>
            </div>
            <div className={pulse.sectionHead}>
              <p>{fit.body}</p>
              <p>
                It suits a coordinator or operations manager juggling several
                client projects, who doesn&rsquo;t have the time, or the say, to
                move everyone onto a new project tool.
              </p>
            </div>
          </div>
        </section>

        <section
          id="loop"
          className={pulse.section}
          aria-labelledby="loop-title"
        >
          <div className={pulse.sectionHead}>
            <p className={pulse.kicker}>Every week, in five steps</p>
            <h2 id="loop-title">{loop.title}</h2>
            <p>{loop.body}</p>
          </div>
          <ol className={pulse.steps}>
            {pulseLoop.map((step, index) => {
              const Icon = loopIcons[index]
              return (
                <li
                  key={step.title}
                  className={pulse.step}
                  data-gate={step.title === "You approve" || undefined}
                >
                  <div className={pulse.stepTop}>
                    <Icon aria-hidden />
                    <span>{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              )
            })}
          </ol>
        </section>

        <section
          id="tools"
          className={pulse.section}
          aria-labelledby="tools-title"
        >
          <div className={pulse.sectionHead}>
            <p className={pulse.kicker}>Your tools stay put</p>
            <h2 id="tools-title">Built around Sheets and Gmail</h2>
            <p>
              Pulse connects through your own Google sign-in, so it works with
              the sheets and mail your account can already reach.
            </p>
          </div>
          <div className={pulse.tools}>
            <article className={pulse.tool}>
              <SheetIcon aria-hidden />
              <h3>Google Sheets is the source of truth</h3>
              <p>
                Your team keeps updating the tracker the way they do now. Pulse
                reads it fresh on every run and points to the rows behind each
                finding.
              </p>
              <small>Free plan</small>
            </article>
            <article className={pulse.tool}>
              <MailIcon aria-hidden />
              <h3>Gmail for the follow-ups</h3>
              <p>
                Approve a nudge and it goes out from your own Gmail address, so
                replies come back to you.
              </p>
              <small>Free plan</small>
            </article>
            <article className={pulse.tool}>
              <CalendarIcon aria-hidden />
              <h3>Add Calendar or Slack later</h3>
              <p>
                Connect more apps when the weekly report works, such as Google
                Calendar for milestones or Slack for a status post.
              </p>
              <small>Free plan, up to {planLimits.free.apps} apps</small>
            </article>
          </div>
        </section>

        <section
          id="approvals"
          className={pulse.section}
          aria-labelledby="approvals-title"
        >
          <div className={pulse.split}>
            <div className={pulse.sectionHead}>
              <p className={pulse.kicker}>You stay in charge</p>
              <h2 id="approvals-title">{approvals.title}</h2>
              <p>{approvals.body}</p>
              <Link href="/ai-agent-human-approval" className={pulse.link}>
                How app approvals work
              </Link>
            </div>
            <ul className={pulse.gates}>
              {approvals.bullets?.map((item) => (
                <li key={item}>
                  <CheckIcon aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id="starter-prompt"
          className={pulse.section}
          aria-labelledby="prompt-title"
        >
          <div className={pulse.split}>
            <div className={pulse.sectionHead}>
              <p className={pulse.kicker}>Your first run</p>
              <h2 id="prompt-title">Start with one read-only report</h2>
              <p>
                The Bot you create here opens by proposing this brief. It only
                reads the sheet and drafts in chat, so you can check the results
                before anything changes. Edit the names and thresholds to match
                your tracker.
              </p>
            </div>
            <div className={pulse.prompt}>
              <CopyPrompt prompt={pulsePrompt} />
              <div className={pulse.promptActions}>
                <Link
                  href={createHref}
                  prefetch={false}
                  className={styles.button}
                >
                  Create the Pulse Bot
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section
          id="plans"
          className={pulse.section}
          aria-labelledby="plans-title"
        >
          <div className={pulse.sectionHead}>
            <p className={pulse.kicker}>Before you start</p>
            <h2 id="plans-title">What it costs and where it stops</h2>
          </div>
          <div className={pulse.callouts}>
            <div className={pulse.callout}>
              <h3>{plans.title}</h3>
              <p>{plans.body}</p>
              <Link href="/#pricing" className={pulse.link}>
                Compare plans
              </Link>
            </div>
            <div className={pulse.callout}>
              <h3>{limits.title}</h3>
              <p>{limits.body}</p>
              <p>
                Pro adds up to {planLimits.paid.bots} Bots, so each client or
                project can have its own coordinator with its own memory.
              </p>
            </div>
          </div>
        </section>

        <section
          id="faqs"
          className={pulse.section}
          aria-labelledby="faq-title"
        >
          <div className={pulse.split}>
            <div className={pulse.sectionHead}>
              <h2 id="faq-title">Questions from project managers</h2>
            </div>
            <BotFaq questions={pulsePage.faqs} />
          </div>
        </section>

        <section className={pulse.final} aria-labelledby="start-title">
          <BotMark
            className={pulse.finalMark}
            color="#35c76f"
            shape="teardrop"
            dimensional
          />
          <h2 id="start-title">Hand off the Monday chase</h2>
          <p>
            Create the Pulse Bot, connect your tracker, and get your first
            project report in chat. It&rsquo;s free to start.
          </p>
          <div className={styles.actions}>
            <GetStartedButton
              href={createHref}
              label="Create your project coordinator"
            />
            <Link href="/how-it-works" className={styles.secondaryButton}>
              How Krafty works
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
