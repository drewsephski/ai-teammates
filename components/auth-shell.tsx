import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { KraftyWordmark } from "@/components/krafty-wordmark"
import { BotMark } from "@/components/landing/bot/bot-mark"
import { buttonVariants } from "@/components/ui/button"

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col bg-background">
      <header className="flex h-20 items-center justify-between px-6 sm:px-10">
        <KraftyWordmark />
        <Link
          href="/"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ArrowLeftIcon /> Back to home
        </Link>
      </header>
      <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-12 px-5 py-10 md:grid-cols-2 md:gap-20 md:px-10">
        <section className="hidden md:block">
          <div
            className="mb-10 flex items-end gap-2 [--bg:var(--background)]"
            aria-hidden="true"
          >
            <BotMark
              shape="blob"
              state="curious"
              color="#f4f4f4"
              className="size-28"
            />
            <BotMark
              shape="gem"
              state="happy"
              color="#b6b0fc"
              className="size-24"
            />
            <BotMark
              shape="wedge"
              state="idle"
              color="#d5ef88"
              className="size-28"
            />
          </div>
          <h1 className="max-w-sm text-5xl leading-[1.08] font-medium tracking-tight">
            Your next idea has company.
          </h1>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-muted-foreground">
            AI teammates with their own personality, memory, and computer.
          </p>
        </section>
        <div className="mx-auto flex w-full max-w-md min-w-0 justify-center">
          {children}
        </div>
      </div>
    </main>
  )
}
