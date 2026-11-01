import type { Metadata } from "next"
import localFont from "next/font/local"
import { auth } from "@clerk/nextjs/server"

import { MarketingSeoPage } from "@/components/landing/bot/marketing-seo-page"
import { pageMetadata } from "@/lib/marketing/content"
import { timeCostCalculatorPage } from "@/lib/marketing/time-cost-page"

const botFont = localFont({
  src: "../../public/landing/bot/display.woff2",
  variable: "--font-bot",
  weight: "200 800",
  display: "swap",
})

export const metadata: Metadata = pageMetadata({
  path: timeCostCalculatorPage.path,
  title: timeCostCalculatorPage.title,
  description: timeCostCalculatorPage.description,
})

export default async function TimeCostCalculatorPage() {
  const { isAuthenticated } = await auth()
  const workspaceHref = isAuthenticated
    ? "/workspace"
    : `/sign-in?redirect_url=${encodeURIComponent("/workspace")}`
  const startHref = isAuthenticated
    ? "/workspace"
    : "/sign-up?redirect_url=%2Fworkspace"

  return (
    <MarketingSeoPage
      config={timeCostCalculatorPage}
      workspaceHref={workspaceHref}
      startHref={startHref}
      fontClassName={botFont.variable}
    />
  )
}
