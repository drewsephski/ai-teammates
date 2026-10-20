import type { CSSProperties } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import localFont from "next/font/local"
import { auth } from "@clerk/nextjs/server"

import { BotNavigation } from "@/components/landing/bot/navigation"
import styles from "@/components/landing/bot/bot-landing.module.css"
import page from "./use-cases.module.css"
import { CopyPrompt } from "./copy-prompt"
import { useCases } from "./use-cases-data"
import { Breadcrumbs } from "@/components/landing/bot/breadcrumbs"
import { PageFooter } from "@/components/landing/bot/page-footer"
import {
  absoluteUrl,
  breadcrumbJsonLd,
  pageMetadata,
} from "@/lib/marketing/content"
import { marketingUpdated, productName, siteUrl } from "@/lib/marketing/site"
import { JsonLd } from "@/components/json-ld"

const botFont = localFont({
  src: "../../public/landing/bot/display.woff2",
  variable: "--font-bot",
  weight: "200 800",
  display: "swap",
})

const title = "AI teammate use cases: sales, ops, engineering"
const description =
  "Nine jobs to give an AI teammate, each with a prompt to copy: outbound sales, recruiting, paid media, expenses, bug repro, support triage, and more."
const trail = [
  { name: "Home", path: "/" },
  { name: "Use cases", path: "/use-cases" },
]

export const metadata: Metadata = pageMetadata({
  path: "/use-cases",
  title,
  description,
})

export default async function UseCasesPage() {
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
              "@type": "CollectionPage",
              "@id": `${siteUrl}/use-cases#page`,
              url: absoluteUrl("/use-cases"),
              name: title,
              description,
              dateModified: marketingUpdated,
              isPartOf: { "@id": `${siteUrl}/#website` },
              about: { "@id": `${siteUrl}/#app` },
              breadcrumb: breadcrumbJsonLd(trail),
              mainEntity: {
                "@type": "ItemList",
                name: `${productName} use cases`,
                itemListElement: useCases.map((role, index) => ({
                  "@type": "ListItem",
                  position: index + 1,
                  name: role.headline,
                  url: absoluteUrl(`/use-cases/${role.id}`),
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
        <header className={`${styles.centerHeading} ${page.intro}`}>
          <h1>AI teammate use cases</h1>
          <p>
            {productName} teammates sign in to your tools, work on their own
            cloud computer, and come back with finished work for you to review.
            Here are nine jobs to start with, each with a prompt you can paste
            into a new Bot and a page on what it does and what waits for your
            approval.
          </p>
          <div className={styles.actions}>
            <Link href={startHref} prefetch={false} className={styles.button}>
              Create your team
            </Link>
            <Link href="/#pricing" className={styles.secondaryButton}>
              View plans
            </Link>
          </div>
        </header>
        <ul className={page.grid}>
          {useCases.map((role) => (
            <li
              key={role.id}
              id={role.id}
              className={page.card}
              style={{ "--role-color": role.color } as CSSProperties}
            >
              <h2>
                <Link href={`/use-cases/${role.id}`}>{role.name}</Link>
              </h2>
              <p>{role.description}</p>
              <CopyPrompt prompt={role.prompt} />
              <Link href={`/use-cases/${role.id}`} className={page.more}>
                How the {role.name} Bot works
                <span aria-hidden="true"> →</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <div className={styles.container}>
        <PageFooter />
      </div>
    </div>
  )
}
