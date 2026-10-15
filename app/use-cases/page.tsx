import type { CSSProperties } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import localFont from "next/font/local"
import { auth } from "@clerk/nextjs/server"

import { BotNavigation } from "@/components/landing/bot/navigation"
import { roles } from "@/components/landing/bot/role-showcase-data"
import styles from "@/components/landing/bot/bot-landing.module.css"
import page from "./use-cases.module.css"
import { brandName, productName, siteUrl } from "@/lib/marketing/site"
import { JsonLd } from "@/components/json-ld"

const botFont = localFont({
  src: "../../public/landing/bot/display.woff2",
  variable: "--font-bot",
  weight: "200 800",
  display: "swap",
})

const title = "AI teammate use cases: sales, ops, engineering"
const description =
  "Eight jobs you can give a Krafty Bot today: outbound sales, recruiting, paid media, expenses, performance, bug repro, account health, and chief of staff."

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/use-cases" },
  openGraph: {
    url: "/use-cases",
    title: `${title} · ${brandName}`,
    description,
  },
  twitter: { title: `${title} · ${brandName}`, description },
}

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
          "@type": "ItemList",
          name: `${productName} use cases`,
          url: `${siteUrl}/use-cases`,
          itemListElement: roles.map((role, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: role.name,
            description: role.description,
          })),
        }}
      />
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <BotNavigation workspaceHref={workspaceHref} />
      <main id="main" className={styles.container}>
        <header className={`${styles.centerHeading} ${page.intro}`}>
          <h1>Give each Bot a job</h1>
          <p>
            {productName} teammates sign in to your tools, work on their own
            cloud computer, and come back with finished work for you to review.
            Here are the roles people start with.
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
          {roles.map((role) => (
            <li
              key={role.id}
              id={role.id}
              className={page.card}
              style={{ "--role-color": role.color } as CSSProperties}
            >
              <h2>{role.name}</h2>
              <p>{role.description}</p>
            </li>
          ))}
        </ul>
      </main>
      <footer className={`${styles.container} ${page.footer}`}>
        <span>
          © {new Date().getFullYear()} {brandName}
        </span>
        <nav aria-label="Footer">
          <Link href="/">Home</Link>
          <Link href="/#pricing">Pricing</Link>
          <Link href="/#faqs">FAQs</Link>
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/terms">Terms of service</Link>
        </nav>
      </footer>
    </div>
  )
}
