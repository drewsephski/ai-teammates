import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"
import localFont from "next/font/local"
import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"

import { BotNavigation } from "@/components/landing/bot/navigation"
import { Breadcrumbs } from "@/components/landing/bot/breadcrumbs"
import { PageFooter } from "@/components/landing/bot/page-footer"
import styles from "@/components/landing/bot/bot-landing.module.css"
import page from "@/app/how-it-works/how-it-works.module.css"
import { JsonLd } from "@/components/json-ld"
import {
  absoluteUrl,
  breadcrumbJsonLd,
  pageMetadata,
} from "@/lib/marketing/content"
import {
  findHelpTopic,
  helpIndex,
  helpTopicPath,
  helpTopics,
} from "@/lib/marketing/help"
import { faqPageJsonLd } from "@/lib/marketing/json-ld"
import { marketingUpdated, siteUrl } from "@/lib/marketing/site"
import { BotFaq } from "@/components/landing/bot/faq"
import { HelpContact } from "../help-contact"
import help from "../help.module.css"

const botFont = localFont({
  src: "../../../public/landing/bot/display.woff2",
  variable: "--font-bot",
  weight: "200 800",
  display: "swap",
})

type Props = { params: Promise<{ slug: string }> }

export const dynamicParams = false

export function generateStaticParams() {
  return helpTopics.map((topic) => ({ slug: topic.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const topic = findHelpTopic((await params).slug)
  if (!topic) return {}
  return pageMetadata({
    path: helpTopicPath(topic.slug),
    title: topic.title,
    description: topic.description,
  })
}

export default async function HelpTopicPage({ params }: Props) {
  const topic = findHelpTopic((await params).slug)
  if (!topic) notFound()

  const { isAuthenticated } = await auth()
  const workspaceHref = isAuthenticated
    ? "/workspace"
    : `/sign-in?redirect_url=${encodeURIComponent("/workspace")}`
  const path = helpTopicPath(topic.slug)
  const pageUrl = absoluteUrl(path)
  const trail = [
    { name: "Home", path: "/" },
    { name: helpIndex.h1, path: helpIndex.path },
    { name: topic.h1, path },
  ]
  const related = topic.related
    .map(findHelpTopic)
    .filter((entry) => entry !== undefined)

  return (
    <div className={`${styles.landing} ${botFont.variable}`} id="top">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebPage",
              "@id": `${pageUrl}#page`,
              url: pageUrl,
              name: topic.title,
              description: topic.description,
              dateModified: marketingUpdated,
              isPartOf: { "@id": `${siteUrl}/#website` },
              about: { "@id": `${siteUrl}/#app` },
              breadcrumb: breadcrumbJsonLd(trail),
            },
            faqPageJsonLd(topic.faqs, `${pageUrl}#faqs`),
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
          <p className={help.eyebrow}>{helpIndex.h1}</p>
          <h1>{topic.h1}</h1>
          <p className={page.lead}>{topic.lead}</p>
        </header>

        <nav className={help.toc} aria-label="On this page">
          <p>On this page</p>
          <ul>
            {topic.sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{section.title}</a>
              </li>
            ))}
            <li>
              <a href="#faqs">Questions</a>
            </li>
          </ul>
        </nav>

        {topic.sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className={page.section}
            aria-labelledby={`${section.id}-title`}
          >
            <h2 id={`${section.id}-title`}>{section.title}</h2>
            {section.steps && (
              <ol className={help.steps}>
                {section.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
            {section.body && (
              <div className={help.prose}>
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            )}
            {section.bullets && (
              <ul className={page.list}>
                {section.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
            {section.links && (
              <p>
                See also:{" "}
                {section.links.map((link, index) => (
                  <span key={link.href}>
                    {index > 0 && ", "}
                    <Link href={link.href} className={page.link}>
                      {link.label}
                    </Link>
                  </span>
                ))}
              </p>
            )}
          </section>
        ))}

        <section id="faqs" className={page.section} aria-labelledby="faq-title">
          <h2 id="faq-title">Questions</h2>
          <div className={help.faqs}>
            <BotFaq questions={topic.faqs} />
          </div>
        </section>

        <section className={page.section} aria-labelledby="related-title">
          <h2 id="related-title">Related help</h2>
          <ul className={help.topics}>
            {related.map((entry) => (
              <li key={entry.slug}>
                <Link href={helpTopicPath(entry.slug)} className={help.topic}>
                  <span>
                    <h3>{entry.h1}</h3>
                    <p>{entry.summary}</p>
                  </span>
                  <ArrowRightIcon size={18} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <p>
            <Link href={helpIndex.path} className={page.link}>
              All help topics
            </Link>
          </p>
        </section>

        <HelpContact />
      </main>
      <div className={styles.container}>
        <PageFooter />
      </div>
    </div>
  )
}
