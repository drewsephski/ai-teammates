import Image from "next/image"
import Link from "next/link"
import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react"

import { BotFaq } from "@/components/landing/bot/faq"
import { BotMark } from "@/components/landing/bot/bot-mark"
import { GuideToc } from "@/components/landing/bot/guide-toc"

import { Breadcrumbs, type Crumb } from "@/components/landing/bot/breadcrumbs"
import { BotNavigation } from "@/components/landing/bot/navigation"
import { PageFooter } from "@/components/landing/bot/page-footer"
import styles from "@/components/landing/bot/bot-landing.module.css"
import page from "./guide-page.module.css"
import type { MarketingPage } from "@/lib/marketing/seo-pages"
import { planLimits } from "@/lib/billing-policy"
import {
  marketingUpdated,
  productName,
  publicPlans,
  siteUrl,
} from "@/lib/marketing/site"
import { JsonLd } from "@/components/json-ld"
import { absoluteUrl, breadcrumbJsonLd } from "@/lib/marketing/content"
import { faqPageJsonLd } from "@/lib/marketing/json-ld"
import { TimeCostCalculator } from "@/components/landing/bot/time-cost-calculator"

/** Internal links stay in the app; links to other products open in a new tab. */
function CardLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={page.link}>
        {children}
      </Link>
    )
  }
  return (
    <a
      href={href}
      className={page.link}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  )
}

// Illustration for each page's header, from public/marketing/visuals/guides.
const guideArt: Record<string, string> = {
  "/ai-agent-human-approval": "approval",
  "/ai-agent-vs-chatbot": "agent-vs-chatbot",
  "/autonomous-ai-agent": "autonomous-agent",
  "/ai-teammates": "teammates",
  "/ai-employees": "teammates",
  "/ai-agents-for-business": "business",
  "/best-ai-agents-small-business": "business",
  "/manus-alternatives": "alternatives",
  "/grokbot-alternatives": "alternatives",
  "/ai-personal-assistant": "personal-assistant",
  "/use-cases/email-assistant": "personal-assistant",
  "/time-cost-calculator": "time",
  "/about": "about",
}

type Props = {
  config: MarketingPage
  workspaceHref: string
  startHref: string
  fontClassName?: string
}

export function MarketingSeoPage({
  config,
  workspaceHref,
  startHref,
  fontClassName,
}: Props) {
  const trail: Crumb[] = [
    { name: "Home", path: "/" },
    { name: config.h1, path: config.path },
  ]
  const pageUrl = absoluteUrl(config.path)
  const art = guideArt[config.path] ?? "teammates"
  const toc = [
    ...config.sections.map(({ id, title }) => ({ id, title })),
    ...(config.useCases?.length
      ? [{ id: "use-cases", title: config.useCasesTitle ?? "Starter prompts" }]
      : []),
    { id: "faqs", title: "FAQs" },
    { id: "related", title: "Related pages" },
  ]
  const updated = new Date(`${marketingUpdated}T12:00:00Z`).toLocaleDateString(
    "en-US",
    { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }
  )

  return (
    <div
      className={`${styles.landing}${fontClassName ? ` ${fontClassName}` : ""}`}
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
              name: `${config.title} · Krafty`,
              description: config.description,
              dateModified: marketingUpdated,
              author: { "@id": `${siteUrl}/#founder` },
              isPartOf: { "@id": `${siteUrl}/#website` },
              about: { "@id": `${siteUrl}/#app` },
              breadcrumb: breadcrumbJsonLd(trail),
              ...(config.widget && {
                mainEntity: {
                  "@type": "WebApplication",
                  name: config.h1,
                  url: pageUrl,
                  applicationCategory: "BusinessApplication",
                  operatingSystem: "Any",
                  isAccessibleForFree: true,
                  offers: { "@type": "Offer", price: 0, priceCurrency: "USD" },
                  publisher: { "@id": `${siteUrl}/#organization` },
                },
              }),
            },
            faqPageJsonLd(config.faqs, `${pageUrl}#faqs`),
          ],
        }}
      />
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <BotNavigation workspaceHref={workspaceHref} />
      <main id="main">
        <header className={page.hero}>
          <Image
            src={`/marketing/visuals/guides/${art}.webp`}
            alt=""
            fill
            priority
            sizes="(max-width: 1280px) 100vw, 1280px"
            className={page.heroImage}
          />
          <div className={page.heroCopy}>
            <Breadcrumbs trail={trail} />
            <h1>{config.h1}</h1>
            <p className={page.lead}>{config.lead}</p>
            <div className={page.heroActions}>
              <Link href={startHref} prefetch={false} className={styles.button}>
                Start free
              </Link>
              <Link href="/how-it-works" className={styles.secondaryButton}>
                How {productName} works
              </Link>
            </div>
            <p className={page.byline}>
              Updated {updated} · By{" "}
              <Link href="/about" rel="author">
                Drew Sepeczi
              </Link>
            </p>
          </div>
        </header>

        {config.widget === "time-cost-calculator" && (
          <div className={page.widget}>
            <TimeCostCalculator />
          </div>
        )}

        <div className={page.layout}>
          <aside className={page.rail}>
            <GuideToc items={toc} />
          </aside>
          <div className={page.content}>
            {config.sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className={page.section}
                aria-labelledby={`${section.id}-title`}
              >
                <h2 id={`${section.id}-title`}>{section.title}</h2>
                {section.body && <p className={page.body}>{section.body}</p>}
                {section.bullets && (
                  <ul className={page.bullets}>
                    {section.bullets.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
                {section.table && (
                  <div
                    className={page.tableWrap}
                    role="region"
                    aria-labelledby={`${section.id}-caption`}
                    tabIndex={0}
                  >
                    <table className={page.table}>
                      <caption id={`${section.id}-caption`}>
                        {section.table.caption}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">{section.table.rowHeader}</th>
                          {section.table.columns.map((column) => (
                            <th key={column} scope="col">
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {section.table.rows.map((row) => (
                          <tr key={row.label}>
                            <th scope="row">{row.label}</th>
                            {row.cells.map((cell, index) => (
                              <td key={index}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {section.cards && (
                  <div className={page.points}>
                    {section.cards.map((card) => (
                      <article key={card.title} className={page.point}>
                        <h3>
                          {card.href ? (
                            <CardLink href={card.href}>{card.title}</CardLink>
                          ) : (
                            card.title
                          )}
                        </h3>
                        <p>{card.body}</p>
                      </article>
                    ))}
                  </div>
                )}
                {section.note && <p className={page.note}>{section.note}</p>}
                {section.links && (
                  <ul className={page.linkList}>
                    {section.links.map((link) => (
                      <li key={link.href}>
                        <CardLink href={link.href}>{link.label}</CardLink>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            {config.useCases && config.useCases.length > 0 && (
              <section
                id="use-cases"
                className={page.section}
                aria-labelledby="use-cases-title"
              >
                <h2 id="use-cases-title">
                  {config.useCasesTitle ?? "Starter prompts"}
                </h2>
                <div className={page.tiles}>
                  {config.useCases.map((useCase) => (
                    <Link
                      key={useCase.href}
                      href={useCase.href}
                      className={page.tile}
                    >
                      <h3>{useCase.title}</h3>
                      <p>{useCase.body}</p>
                      <ArrowUpRightIcon
                        size={16}
                        className={page.tileArrow}
                        aria-hidden
                      />
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section
              id="faqs"
              className={page.section}
              aria-labelledby="faq-title"
            >
              <h2 id="faq-title">FAQs</h2>
              <BotFaq questions={config.faqs} />
            </section>

            <section
              id="related"
              className={page.section}
              aria-labelledby="related-title"
            >
              <h2 id="related-title">Related pages</h2>
              <ul className={page.related}>
                {config.related.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href}>
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.description}</small>
                      </span>
                      <ArrowRightIcon size={18} aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <section className={page.final} aria-labelledby="start-title">
          <div className={page.finalCopy}>
            <h2 id="start-title">Try an AI teammate</h2>
            <p>
              Start free with one Bot and one connected app. Pro is $
              {publicPlans[1].price} a month for up to {planLimits.paid.bots}{" "}
              Bots and {planLimits.paid.sandbox / 3600} hours of computer time.{" "}
              <Link href="/ai-agent-human-approval">
                App writes wait for approval unless an eligible rule allows
                them.
              </Link>
            </p>
            <div className={page.heroActions}>
              <Link href={startHref} prefetch={false} className={styles.button}>
                Get started
              </Link>
            </div>
            <BotMark className={page.finalMark} color="#efe7dc" dimensional />
          </div>
        </section>
      </main>
      <div className={styles.container}>
        <PageFooter />
      </div>
    </div>
  )
}
