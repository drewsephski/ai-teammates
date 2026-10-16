import Link from "next/link"
import type { ReactNode } from "react"

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8 sm:py-12">
      <header className="mb-12 flex items-center justify-between gap-4">
        <Link href="/" className="text-xl font-semibold">
          Krafty
        </Link>
        <Link
          href="/"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          Back to home
        </Link>
      </header>
      <main className="text-base leading-7 text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_h1]:mb-3 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-foreground [&_h2]:mt-9 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:my-2 [&_p]:my-4 [&_ul]:list-disc [&_ul]:pl-6">
        {children}
      </main>
      <footer className="mt-12 flex flex-wrap gap-6 border-t pt-6 text-sm text-muted-foreground">
        <Link href="/support" className="underline underline-offset-4">
          Support
        </Link>
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy policy
        </Link>
        <Link href="/terms" className="underline underline-offset-4">
          Terms of service
        </Link>
        <a
          href="mailto:drewsepeczi@gmail.com"
          className="underline underline-offset-4"
        >
          Contact
        </a>
      </footer>
    </div>
  )
}
