import { ClerkProvider } from "@clerk/nextjs"
import { shadcn } from "@clerk/ui/themes"
import { Geist_Mono } from "next/font/google"
import localFont from "next/font/local"
import type { Metadata } from "next"
import { headers } from "next/headers"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const kraftyFont = localFont({
  src: "../public/landing/bot/display.woff2",
  variable: "--font-sans",
  weight: "200 800",
  display: "swap",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  metadataBase: new URL("https://kraftybot.app"),
  title: { default: "Krafty", template: "%s · Krafty" },
  applicationName: "Krafty",
  description: "AI teammates with their own personality, memory, and computer.",
  openGraph: {
    title: "Krafty — AI teammates you can give real work to",
    description:
      "Create your team, connect your tools, and work together with persistent memory and cloud computers.",
    siteName: "Krafty",
    type: "website",
    locale: "en_US",
    url: "/",
    images: [
      {
        url: "/brand/krafty-social-v1.jpg",
        width: 1200,
        height: 630,
        type: "image/jpeg",
        alt: "Krafty — AI teammates you can give real work to. An ivory sculptural bot on a charcoal backdrop.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Krafty — AI teammates you can give real work to",
    description:
      "AI teammates with their own personality, memory, and computer.",
    images: [
      {
        url: "/brand/krafty-social-v1.jpg",
        alt: "Krafty — AI teammates you can give real work to. An ivory sculptural bot on a charcoal backdrop.",
      },
    ],
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Every document must render per request so its scripts share the CSP nonce.
  const nonce = (await headers()).get("x-nonce") ?? undefined

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        kraftyFont.variable
      )}
    >
      <body>
        <ClerkProvider
          dynamic
          nonce={nonce}
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/workspace"
          signUpFallbackRedirectUrl="/workspace"
          appearance={{
            theme: shadcn,
            variables: { borderRadius: "0.875rem" },
            elements: {
              cardBox: "rounded-3xl! shadow-none! ring-1! ring-border!",
              card: "bg-card! p-6! sm:p-8!",
              formButtonPrimary: "rounded-full! min-h-10! shadow-none!",
              socialButtonsBlockButton: "rounded-xl! min-h-11!",
              formFieldInput:
                "rounded-xl! min-h-10! bg-muted! placeholder:text-muted-foreground!",
              footer: "bg-card!",
              pricingTable: "gap-5!",
              pricingTableCard:
                "rounded-2xl! shadow-none! ring-1! ring-border!",
              pricingTableCardFooterButton:
                "min-h-10! rounded-full! shadow-none!",
            },
          }}
          localization={{
            signIn: {
              start: {
                title: "Sign in to Krafty",
                titleCombined: "Sign in to Krafty",
                subtitle: "Welcome back. Sign in to continue.",
                subtitleCombined: "Welcome back. Sign in to continue.",
              },
            },
            signUp: {
              start: {
                title: "Create your Krafty account",
                titleCombined: "Create your Krafty account",
                subtitle: "Get started with Krafty.",
                subtitleCombined: "Get started with Krafty.",
              },
            },
          }}
        >
          <ThemeProvider nonce={nonce}>
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster />
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
