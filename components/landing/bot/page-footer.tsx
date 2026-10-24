import Link from "next/link"

import { useCases } from "@/app/use-cases/use-cases-data"
import { brandName } from "@/lib/marketing/site"
import styles from "./page-chrome.module.css"

/** Footer for public subpages. Links every role page so each is crawlable. */
export function PageFooter({ className }: { className?: string }) {
  return (
    <footer className={`${styles.footer} ${className ?? ""}`}>
      <nav aria-label="Product" className={styles.footerColumn}>
        <p className={styles.footerHeading}>Product</p>
        <Link href="/">Overview</Link>
        <Link href="/how-it-works">How it works</Link>
        <Link href="/use-cases">Use cases</Link>
        <Link href="/ai-agents-for-business">AI agents for business</Link>
        <Link href="/ai-employees">AI employees</Link>
        <Link href="/manus-alternatives">Manus alternatives</Link>
        <Link href="/autonomous-ai-agent">Autonomous AI agent</Link>
        <Link href="/#pricing">Pricing</Link>
        <Link href="/#faqs">FAQs</Link>
      </nav>
      <nav aria-label="Use cases" className={styles.footerColumn}>
        <p className={styles.footerHeading}>Use cases</p>
        {useCases.map((useCase) => (
          <Link key={useCase.id} href={`/use-cases/${useCase.id}`}>
            {useCase.name}
          </Link>
        ))}
      </nav>
      <nav aria-label="Company" className={styles.footerColumn}>
        <p className={styles.footerHeading}>Company</p>
        <Link href="/support">Support</Link>
        <Link href="/privacy">Privacy policy</Link>
        <Link href="/terms">Terms of service</Link>
      </nav>
      <p className={styles.footerNote}>
        © {new Date().getFullYear()} {brandName}. AI teammates with a memory and
        a computer of their own.
      </p>
    </footer>
  )
}
