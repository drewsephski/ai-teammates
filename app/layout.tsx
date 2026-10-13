import { ClerkProvider } from "@clerk/nextjs"
import { shadcn } from "@clerk/ui/themes"
import { Geist_Mono } from "next/font/google"
import localFont from "next/font/local"
import type { Metadata } from "next"

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
  title: { default: "Krafty", template: "%s · Krafty" },
  applicationName: "Krafty",
  description: "AI teammates with their own personality, memory, and computer.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
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
              formFieldInput: "rounded-xl! min-h-10!",
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
          <ThemeProvider>
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster />
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
