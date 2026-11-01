import type { Metadata } from "next"
import Link from "next/link"
import localFont from "next/font/local"
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
import { helpIndex, helpTopicPath, helpTopics } from "@/lib/marketing/help"
import { marketingUpdated, productName, siteUrl } from "@/lib/marketing/site"
import { HelpContact } from "./help-contact"
import help from "./help.module.css"

const botFont = localFont({
  src: "../../public/landing/bot/display.woff2",
  variable: "--font-bot",
  weight: "200 800",
  display: "swap",
})

const trail = [
  { name: "Home", path: "/" },
  { name: helpIndex.h1, path: helpIndex.path },
]

export const metadata: Metadata = pageMetadata({
  path: helpIndex.path,
  title: helpIndex.title,
  description: helpIndex.description,
})

export default async function HelpPage() {
  const { isAuthenticated } = await auth()
  const workspaceHref = isAuthenticated
    ? "/workspace"
    : `/sign-in?redirect_url=${encodeURIComponent("/workspace")}`

  return (
    <div className={`${styles.landing} ${botFont.variable}`} id="top">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "CollectionPage",
              "@id": `${absoluteUrl(helpIndex.path)}#page`,
              url: absoluteUrl(helpIndex.path),
              name: helpIndex.title,
              description: helpIndex.description,
              dateModified: marketingUpdated,
              isPartOf: { "@id": `${siteUrl}/#website` },
              about: { "@id": `${siteUrl}/#app` },
              breadcrumb: breadcrumbJsonLd(trail),
              mainEntity: {
                "@type": "ItemList",
                name: `${productName} help topics`,
                itemListElement: helpTopics.map((topic, index) => ({
                  "@type": "ListItem",
                  position: index + 1,
                  name: topic.h1,
                  url: absoluteUrl(helpTopicPath(topic.slug)),
                })),
              },
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
          <h1>{helpIndex.h1}</h1>
          <p className={page.lead}>{helpIndex.lead}</p>
        </header>
        <ul className={help.topics} aria-label="Help topics">
          {helpTopics.map((topic) => (
            <li key={topic.slug} className={help.topic}>
              <h2>
                <Link href={helpTopicPath(topic.slug)}>{topic.h1}</Link>
              </h2>
              <p>{topic.summary}</p>
            </li>
          ))}
        </ul>
        <HelpContact />
      </main>
      <div className={styles.container}>
        <PageFooter />
      </div>
    </div>
  )
}
