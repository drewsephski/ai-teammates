import type { Metadata } from "next"
import localFont from "next/font/local"
import { auth } from "@clerk/nextjs/server"

import { MarketingSeoPage } from "@/components/landing/bot/marketing-seo-page"
import { pageMetadata } from "@/lib/marketing/content"
import { aboutPage } from "@/lib/marketing/about"

const botFont = localFont({
  src: "../../public/landing/bot/display.woff2",
  variable: "--font-bot",
  weight: "200 800",
  display: "swap",
})

export const metadata: Metadata = pageMetadata({
  path: aboutPage.path,
  title: aboutPage.title,
  description: aboutPage.description,
})

export default async function AboutPage() {
  const { isAuthenticated } = await auth()
  const workspaceHref = isAuthenticated
    ? "/workspace"
    : `/sign-in?redirect_url=${encodeURIComponent("/workspace")}`
  const startHref = isAuthenticated
    ? "/workspace"
    : "/sign-up?redirect_url=%2Fworkspace"

  return (
    <MarketingSeoPage
      config={aboutPage}
      workspaceHref={workspaceHref}
      startHref={startHref}
      fontClassName={botFont.variable}
    />
  )
}
