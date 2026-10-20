import { ClerkProvider } from "@clerk/nextjs"
import { shadcn } from "@clerk/ui/themes"
import { Geist_Mono } from "next/font/google"
import localFont from "next/font/local"
import type { Metadata, Viewport } from "next"
import { headers } from "next/headers"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  brandName,
  siteDescription,
  siteTitle,
  siteUrl,
  socialImage,
} from "@/lib/marketing/site"

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
  metadataBase: new URL(siteUrl),
  title: { default: siteTitle, template: `%s · ${brandName}` },
  applicationName: brandName,
  description: siteDescription,
  creator: "Drew Sepeczi",
  publisher: brandName,
  category: "productivity",
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    siteName: brandName,
    type: "website",
    locale: "en_US",
    images: [{ ...socialImage, type: "image/jpeg" }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: [{ url: socialImage.url, alt: socialImage.alt }],
  },
}

export const viewport: Viewport = {
  // Dark is the default theme; match the browser chrome to app/globals.css.
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
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
