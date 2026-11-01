import Link from "next/link"

import { Breadcrumbs, type Crumb } from "@/components/landing/bot/breadcrumbs"
import { BotNavigation } from "@/components/landing/bot/navigation"
import { PageFooter } from "@/components/landing/bot/page-footer"
import styles from "@/components/landing/bot/bot-landing.module.css"
import page from "@/app/how-it-works/how-it-works.module.css"
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
      <main id="main" className={styles.container}>
        <Breadcrumbs trail={trail} />
        <header className={page.header}>
          <h1>{config.h1}</h1>
          <p className={page.lead}>{config.lead}</p>
          <p className={page.updated}>
            Updated {updated} · By{" "}
            <Link href="/about" className={page.link} rel="author">
              Drew Sepeczi
            </Link>
          </p>
          <div className={styles.actions}>
            <Link href={startHref} prefetch={false} className={styles.button}>
              Start free
            </Link>
            <Link href="/how-it-works" className={styles.secondaryButton}>
              How {productName} works
            </Link>
          </div>
        </header>

        {config.widget === "time-cost-calculator" && <TimeCostCalculator />}

        {config.sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className={page.section}
            aria-labelledby={`${section.id}-title`}
          >
            <h2 id={`${section.id}-title`}>{section.title}</h2>
            {section.body && <p>{section.body}</p>}
            {section.bullets && (
              <ul className={page.list}>
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
              <div className={page.grid}>
                {section.cards.map((card) => (
                  <article key={card.title}>
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
              <ul className={page.list}>
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
            <div className={page.grid}>
              {config.useCases.map((useCase) => (
                <article key={useCase.href}>
                  <h3>
                    <Link href={useCase.href} className={page.link}>
                      {useCase.title}
                    </Link>
                  </h3>
                  <p>{useCase.body}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        <section id="faqs" className={page.section} aria-labelledby="faq-title">
          <h2 id="faq-title">FAQs</h2>
          <div className={page.grid}>
            {config.faqs.map(([question, answer]) => (
              <article key={question}>
                <h3>{question}</h3>
                <p>{answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={page.section} aria-labelledby="related-title">
          <h2 id="related-title">Related pages</h2>
          <div className={page.grid}>
            {config.related.map((item) => (
              <article key={item.href}>
                <h3>
                  <Link href={item.href} className={page.link}>
                    {item.label}
                  </Link>
                </h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={page.final} aria-labelledby="start-title">
          <h2 id="start-title">Try an AI teammate</h2>
          <p>
            Start free with one Bot and one connected app. Pro is $
            {publicPlans[1].price} a month for up to {planLimits.paid.bots} Bots
            and {planLimits.paid.sandbox / 3600} hours of computer time.{" "}
            <Link href="/ai-agent-human-approval" className={page.link}>
              App writes wait for approval unless an eligible rule allows them.
            </Link>
          </p>
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
