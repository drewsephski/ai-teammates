import type { Metadata } from "next"
import Link from "next/link"
import localFont from "next/font/local"

import { PageFooter } from "@/components/landing/bot/page-footer"
import styles from "@/components/landing/bot/bot-landing.module.css"

const botFont = localFont({
  src: "../public/landing/bot/display.woff2",
  variable: "--font-bot",
  weight: "200 800",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
}

export default function NotFound() {
  return (
    <div className={`${styles.landing} ${botFont.variable}`}>
      <main className={`${styles.container} ${styles.final}`}>
        <h1 className={styles.notFoundTitle}>Page not found</h1>
        <p>This page doesn&apos;t exist or has moved.</p>
        <div className={styles.actions}>
          <Link href="/" className={styles.button}>
            Go to the homepage
          </Link>
          <Link href="/use-cases" className={styles.secondaryButton}>
            See use cases
          </Link>
        </div>
      </main>
      <div className={styles.container}>
        <PageFooter />
      </div>
    </div>
  )
}
