import { ClerkProvider } from "@clerk/nextjs"
import { shadcn } from "@clerk/ui/themes"
import { Geist, Geist_Mono } from "next/font/google"
import type { Metadata } from "next"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

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
        geist.variable
      )}
    >
      <body>
        <ClerkProvider
          appearance={{ theme: shadcn }}
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
