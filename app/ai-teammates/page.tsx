import type { Metadata } from "next"
import localFont from "next/font/local"
import { auth } from "@clerk/nextjs/server"

import { MarketingSeoPage } from "@/components/landing/bot/marketing-seo-page"
import { pageMetadata } from "@/lib/marketing/content"
import { aiTeammatesPage } from "@/lib/marketing/seo-pages"

const botFont = localFont({
  src: "../../public/landing/bot/display.woff2",
  variable: "--font-bot",
  weight: "200 800",
  display: "swap",
})

export const metadata: Metadata = pageMetadata({
  path: aiTeammatesPage.path,
  title: aiTeammatesPage.title,
  description: aiTeammatesPage.description,
})

export default async function AiTeammatesPage() {
  const { isAuthenticated } = await auth()
  const workspaceHref = isAuthenticated
    ? "/workspace"
    : `/sign-in?redirect_url=${encodeURIComponent("/workspace")}`
  const startHref = isAuthenticated
    ? "/workspace"
    : "/sign-up?redirect_url=%2Fworkspace"

  return (
    <MarketingSeoPage
      config={aiTeammatesPage}
      workspaceHref={workspaceHref}
      startHref={startHref}
      fontClassName={botFont.variable}
    />
  )
}
