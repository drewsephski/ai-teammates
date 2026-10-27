import Link from "next/link"

import { Breadcrumbs, type Crumb } from "@/components/landing/bot/breadcrumbs"
import { BotNavigation } from "@/components/landing/bot/navigation"
import { PageFooter } from "@/components/landing/bot/page-footer"
import styles from "@/components/landing/bot/bot-landing.module.css"
import page from "@/app/how-it-works/how-it-works.module.css"
import type { MarketingPage } from "@/lib/marketing/seo-pages"
import { marketingUpdated, productName, siteUrl } from "@/lib/marketing/site"
import { JsonLd } from "@/components/json-ld"
import { absoluteUrl, breadcrumbJsonLd } from "@/lib/marketing/content"
import { faqPageJsonLd } from "@/lib/marketing/json-ld"

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
              isPartOf: { "@id": `${siteUrl}/#website` },
              about: { "@id": `${siteUrl}/#app` },
              breadcrumb: breadcrumbJsonLd(trail),
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
          <p className={page.updated}>Updated {updated}</p>
          <div className={styles.actions}>
            <Link href={startHref} prefetch={false} className={styles.button}>
              Start free
            </Link>
            <Link href="/how-it-works" className={styles.secondaryButton}>
              How {productName} works
            </Link>
          </div>
        </header>

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
            {section.cards && (
              <div className={page.grid}>
                {section.cards.map((card) => (
                  <article key={card.title}>
                    <h3>{card.title}</h3>
                    <p>{card.body}</p>
                  </article>
                ))}
              </div>
            )}
            {section.links && (
              <ul className={page.list}>
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={page.link}>
                      {link.label}
                    </Link>
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
            <h2 id="use-cases-title">Small-business examples</h2>
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

        <section
          id="faqs"
          className={page.section}
          aria-labelledby="faq-title"
        >
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

        <section
          className={page.section}
          aria-labelledby="related-title"
        >
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
