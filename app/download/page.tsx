import type { Metadata } from "next"
import Link from "next/link"
import localFont from "next/font/local"
import { headers } from "next/headers"
import { auth } from "@clerk/nextjs/server"

import { AppDownloadQr } from "@/components/app-download-qr"
import { BotNavigation } from "@/components/landing/bot/navigation"
import styles from "@/components/landing/bot/bot-landing.module.css"
import {
  androidApkUrl,
  androidDownloadPath,
  detectMobilePlatform,
} from "@/lib/app-download"
import { brandName, productName } from "@/lib/marketing/site"
import page from "./download.module.css"

const botFont = localFont({
  src: "../../public/landing/bot/display.woff2",
  variable: "--font-bot",
  weight: "200 800",
  display: "swap",
})

const title = "Get the Krafty app for Android and iPhone"
const description = `Download ${productName} for Android. The iPhone app is coming soon to the App Store.`

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/download" },
  openGraph: {
    url: "/download",
    title: `${title} · ${brandName}`,
    description,
  },
  twitter: { title: `${title} · ${brandName}`, description },
}

export default async function DownloadPage() {
  const [{ isAuthenticated }, requestHeaders] = await Promise.all([
    auth(),
    headers(),
  ])
  const workspaceHref = isAuthenticated
    ? "/workspace"
    : `/sign-in?redirect_url=${encodeURIComponent("/workspace")}`
  const device = detectMobilePlatform(requestHeaders.get("user-agent"))
  const androidReady = androidApkUrl(process.env.ANDROID_APK_URL) !== null

  const android = (
    <li key="android" className={page.card}>
      <h2>Android</h2>
      {!androidReady ? (
        <p>The Android app is coming soon.</p>
      ) : device === "android" ? (
        <>
          <p>Install {brandName} straight from this page.</p>
          <a href={androidDownloadPath} className={styles.button}>
            Download for Android
          </a>
          <ol className={page.steps}>
            <li>Tap Download for Android.</li>
            <li>
              Open the file when it finishes. If Android asks, allow your
              browser to install apps.
            </li>
            <li>Open {brandName} and sign in with your account.</li>
          </ol>
        </>
      ) : (
        <>
          <p>
            Scan the code with your Android phone&apos;s camera to open this
            page there, then tap Download for Android.
          </p>
          {device === null && (
            <div className={page.qr}>
              <AppDownloadQr size={176} />
            </div>
          )}
          <a href={androidDownloadPath} className={page.textLink}>
            Download the APK on this device
          </a>
        </>
      )}
    </li>
  )

  const iphone = (
    <li key="ios" className={page.card}>
      <h2>iPhone</h2>
      <p>
        Coming soon to the App Store. Until then, use {brandName} in Safari.
      </p>
      <span className={page.soon}>Coming soon</span>
      <Link href={workspaceHref} prefetch={false} className={page.textLink}>
        Open {brandName} in your browser
      </Link>
    </li>
  )

  return (
    <div className={`${styles.landing} ${botFont.variable}`} id="top">
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <BotNavigation workspaceHref={workspaceHref} />
      <main id="main" className={styles.container}>
        <header className={`${styles.centerHeading} ${page.intro}`}>
          <h1>{brandName} on your phone</h1>
          <p>
            Chat with your Bots, answer their questions, and review their work
            from anywhere.
          </p>
        </header>
        <ul className={page.grid}>
          {device === "ios" ? [iphone, android] : [android, iphone]}
        </ul>
      </main>
      <footer className={`${styles.container} ${page.footer}`}>
        <span>
          © {new Date().getFullYear()} {brandName}
        </span>
        <nav aria-label="Footer">
          <Link href="/">Home</Link>
          <Link href="/#pricing">Pricing</Link>
          <Link href="/support">Support</Link>
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/terms">Terms of service</Link>
        </nav>
      </footer>
    </div>
  )
}
