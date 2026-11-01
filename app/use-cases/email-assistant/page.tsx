import type { Metadata } from "next"
import localFont from "next/font/local"
import { auth } from "@clerk/nextjs/server"

import { MarketingSeoPage } from "@/components/landing/bot/marketing-seo-page"
import { pageMetadata } from "@/lib/marketing/content"
import { emailAssistantPage } from "@/lib/marketing/email-assistant"
import { createBotHref } from "@/lib/marketing/site"

const botFont = localFont({
  src: "../../../public/landing/bot/display.woff2",
  variable: "--font-bot",
  weight: "200 800",
  display: "swap",
})

export const metadata: Metadata = pageMetadata({
  path: emailAssistantPage.path,
  title: emailAssistantPage.title,
  description: emailAssistantPage.description,
})

export default async function EmailAssistantPage() {
  const { isAuthenticated } = await auth()
  const workspaceHref = isAuthenticated
    ? "/workspace"
    : `/sign-in?redirect_url=${encodeURIComponent("/workspace")}`
  // Its calls to action create the Email Assistant template
  const startHref = createBotHref("email-assistant", isAuthenticated)

  return (
    <MarketingSeoPage
      config={emailAssistantPage}
      workspaceHref={workspaceHref}
      startHref={startHref}
      fontClassName={botFont.variable}
    />
  )
}
