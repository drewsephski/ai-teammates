"use client"

import { useEffect, useRef, useState } from "react"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  MessageCircleIcon,
  MonitorIcon,
  PlugIcon,
} from "lucide-react"
import { BotMark } from "@/components/landing/bot/bot-mark"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { botPresets, type BotPresetId } from "@/lib/bot-presets"

const startingPoints = {
  research: {
    shape: "blob",
    color: "#b5a7fc",
  },
  code: {
    shape: "hex",
    color: "#208bff",
  },
  writing: {
    shape: "bean",
    color: "#d9f38b",
  },
  learning: {
    shape: "egg",
    color: "#ff8a19",
  },
  planning: {
    shape: "cloud",
    color: "#b5a7fc",
  },
  data: {
    shape: "gem",
    color: "#35c76f",
  },
} as const

export function WorkspaceOnboardingFlow({
  initialPresetId,
  onSkip,
  onCreate,
  pending,
  renderConnections,
}: {
  initialPresetId?: BotPresetId
  onSkip: () => void
  onCreate: (presetId?: BotPresetId) => void
  pending: boolean
  renderConnections?: (presetId?: BotPresetId) => React.ReactNode
}) {
  const [presetId, setPresetId] = useState(initialPresetId)
  const [step, setStep] = useState<"choose" | "meet">(
    initialPresetId ? "meet" : "choose"
  )
  const preset = botPresets.find((item) => item.id === presetId)
  const character = presetId
    ? startingPoints[presetId]
    : startingPoints.research
  const heading = useRef<HTMLHeadingElement>(null)
  const previousStep = useRef(step)

  useEffect(() => {
    if (previousStep.current !== step) heading.current?.focus()
    previousStep.current = step
  }, [step])

  function choose(id?: BotPresetId) {
    setPresetId(id)
    setStep("meet")
  }

  return (
    <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-5xl flex-col px-5 py-6 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ol
          aria-label="Getting started"
          className="flex items-center gap-3 text-xs whitespace-nowrap sm:text-sm"
        >
          <li
            aria-current={step === "choose" ? "step" : undefined}
            className="flex items-center gap-2"
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-foreground text-background">
              {step === "meet" ? (
                <CheckIcon aria-hidden="true" className="size-3.5" />
              ) : (
                "1"
              )}
            </span>
            <span
              className={
                step === "choose" ? "font-medium" : "text-muted-foreground"
              }
            >
              Choose a goal
            </span>
          </li>
          <li aria-hidden="true" className="h-px w-5 bg-border sm:w-10" />
          <li
            aria-current={step === "meet" ? "step" : undefined}
            className="flex items-center gap-2"
          >
            <span
              className={`flex size-6 items-center justify-center rounded-full ${step === "meet" ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}
            >
              2
            </span>
            <span
              className={`sr-only sm:not-sr-only ${step === "meet" ? "font-medium" : "text-muted-foreground"}`}
            >
              Connect & start
            </span>
          </li>
        </ol>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={onSkip}
          className="shrink-0 text-muted-foreground"
        >
          Skip for now
        </Button>
      </div>

      <div className="my-auto grid items-center gap-6 py-8 sm:gap-8 sm:py-10 lg:grid-cols-[1.3fr_1fr] lg:gap-12">
        <div key={step} className="onboarding-step min-w-0">
          <h1
            ref={heading}
            tabIndex={-1}
            className="max-w-lg text-3xl leading-tight font-medium tracking-tight text-balance outline-none sm:text-4xl"
          >
            {step === "choose"
              ? "Give it the outcome. Let it do the work."
              : preset
                ? `Meet your ${preset.job.toLowerCase()}.`
                : "A teammate, made for you."}
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
            {step === "choose"
              ? "Pick a real workflow. Your teammate can research in a browser, work with files and code, and take action in the services you connect."
              : "Bring the whole task, not just a question. Connect the services it needs, then tell your teammate what a finished result looks like."}
          </p>

          {step === "choose" ? (
            <>
              <div
                className="mt-8 grid gap-2 sm:grid-cols-2"
                aria-label="Choose a starting point"
              >
                {botPresets.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => choose(role.id)}
                    className="group flex min-h-16 items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition-colors hover:border-input hover:bg-muted/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none sm:min-h-20"
                  >
                    <role.icon
                      aria-hidden="true"
                      className="size-5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {role.onboardingTitle}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {role.onboardingDetail}
                      </span>
                    </span>
                    <ArrowRightIcon
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                    />
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                onClick={() => choose()}
                className="mt-5 -ml-3 text-muted-foreground"
              >
                I have something else in mind{" "}
                <ArrowRightIcon aria-hidden="true" />
              </Button>
            </>
          ) : (
            <>
              <ol className="mt-8 space-y-5">
                {[
                  [
                    "Define the finished result",
                    "A researched brief, a tested fix, a published article, or an updated project tracker.",
                  ],
                  [
                    "Put it to work across your tools",
                    "Use connected apps for account actions, and the live computer for browsing, code, and files.",
                  ],
                ].map(([title, detail], index) => (
                  <li key={title} className="flex gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{title}</p>
                      <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
                        {detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <section
                className="mt-7 border-t pt-5"
                aria-label="Connect your services"
              >
                <h2 className="flex items-center gap-2 text-base font-medium">
                  <PlugIcon aria-hidden="true" className="size-4" /> Give it
                  access to your services
                </h2>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                  Connect a service below, or search for any supported app.
                  You’ll sign in through its authorization page.
                </p>
                {renderConnections?.(presetId)}
                <p className="mt-3 max-w-md text-xs leading-relaxed text-muted-foreground">
                  For browser-only services, your teammate can ask you to sign
                  in yourself in Desktop. Keep passwords and verification codes
                  out of chat.
                </p>
              </section>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button
                  size="lg"
                  onClick={() => onCreate(presetId)}
                  disabled={pending}
                  aria-busy={pending}
                >
                  {pending ? (
                    <Spinner aria-hidden="true" data-icon="inline-start" />
                  ) : (
                    <MessageCircleIcon aria-hidden="true" />
                  )}
                  {pending ? "Opening your conversation…" : "Meet my teammate"}
                  {!pending && <ArrowRightIcon aria-hidden="true" />}
                </Button>
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setStep("choose")}
                >
                  <ArrowLeftIcon aria-hidden="true" /> Back
                </Button>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                You can change its role and appearance later.
              </p>
            </>
          )}
        </div>

        <aside
          className={`flex min-w-0 flex-col items-center justify-center ${step === "choose" ? "order-first lg:order-last" : ""}`}
          aria-label={
            step === "meet" ? "Your starting role" : "Meet the possibilities"
          }
        >
          {step === "choose" ? (
            <>
              <div
                aria-hidden="true"
                className="relative h-24 w-64 [--bg:var(--card)] sm:h-44 sm:w-80 lg:h-64 lg:w-full"
              >
                <BotMark
                  shape="bean"
                  state="curious"
                  color="#d9f38b"
                  className="absolute bottom-0 left-0 size-24 -rotate-12 sm:size-36 lg:size-44"
                />
                <BotMark
                  shape="blob"
                  state="listening"
                  color="#b5a7fc"
                  className="absolute bottom-3 left-1/2 z-10 size-32 -translate-x-1/2 sm:bottom-8 sm:size-44 lg:size-52"
                />
                <BotMark
                  shape="egg"
                  state="curious"
                  color="#ff8a19"
                  className="absolute right-0 bottom-0 size-24 rotate-12 sm:size-36 lg:size-44"
                />
              </div>
              <p className="mt-6 hidden max-w-56 text-center text-sm leading-relaxed text-muted-foreground lg:block">
                <span className="flex items-center justify-center gap-2">
                  <MonitorIcon aria-hidden="true" className="size-4" /> A
                  computer to do the work.
                </span>
                <span className="mt-2 block">Your services, connected.</span>
              </p>
            </>
          ) : (
            <div
              key={presetId ?? "custom"}
              className="onboarding-step flex w-full flex-col items-center rounded-2xl bg-muted/40 px-6 py-7 sm:p-8"
            >
              <div aria-hidden="true" className="[--bg:var(--card)]">
                <BotMark
                  shape={character.shape}
                  color={character.color}
                  state="curious"
                  className="size-32 sm:size-44"
                />
              </div>
              <h2 className="mt-2 text-lg font-medium">
                {preset?.job ?? "Your next teammate"}
              </h2>
              <p className="mt-3 max-w-xs text-center text-sm leading-relaxed text-muted-foreground">
                {preset?.description ??
                  "Give your teammate a multi-step goal. It can gather context, work in connected services, and use a cloud computer when your plan includes one."}
              </p>
              <div className="mt-7 w-full border-t pt-5">
                <p className="text-xs text-muted-foreground">
                  A first request could sound like
                </p>
                <p className="mt-3 text-sm leading-relaxed">
                  “
                  {preset?.prompt ??
                    "Research this project, create the deliverables, and update my connected workspace. Prompt me to sign in wherever access is needed."}
                  ”
                </p>
              </div>
              <p className="mt-5 text-xs text-muted-foreground">
                Appearance is a preview. Make it yours in chat settings.
              </p>
            </div>
          )}
        </aside>
      </div>

      <footer className="flex flex-col gap-2 border-t py-5 text-xs leading-relaxed text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>One teammate. One connected app. A one-time $1 AI allowance.</p>
        <p>Cloud computers and persistent files are available on paid plans.</p>
      </footer>
    </div>
  )
}
