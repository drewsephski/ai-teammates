"use client"

import { useRef, useState } from "react"
import { MonitorIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"

type Reason = "sign-in" | "verification" | "captcha" | "payment"
// `reason` is absent for a plain sign-in, and for bots on older prompts
type Login = { service: string; hostname: string; reason?: Reason }

// The card's wording per blocker. The answers must match the options the server
// writes for the question (computerLoginQuestion in lib/bot-setup-tools.ts).
export function computerLoginCopy(login: Login) {
  const { service } = login
  switch (login.reason ?? "sign-in") {
    case "verification":
      return {
        title: `Finish verification on ${service}`,
        body: "Finish the verification step in Desktop, then I’ll continue. Keep codes out of chat.",
        open: "Open Desktop",
        done: { label: "I’m done", answer: "I'm done" },
        cancel: { label: "Cancel", answer: "Cancel" },
      }
    case "captcha":
      return {
        title: `Complete the check on ${service}`,
        body: "Complete the check in Desktop that proves you’re a person, then I’ll continue.",
        open: "Open Desktop",
        done: { label: "I’m done", answer: "I'm done" },
        cancel: { label: "Cancel", answer: "Cancel" },
      }
    case "payment":
      return {
        title: `Complete the payment on ${service}`,
        body: "Complete the payment in Desktop yourself. I won’t enter payment details.",
        open: "Open Desktop",
        done: { label: "I’m done", answer: "I'm done" },
        cancel: { label: "Cancel", answer: "Cancel" },
      }
    default:
      return {
        title: `Sign in to ${service}`,
        body: "Sign in on my computer, then I’ll continue. Keep passwords and codes out of chat.",
        open: "Open sign-in",
        done: { label: "I’m signed in", answer: "I'm signed in" },
        cancel: { label: "Cancel sign-in", answer: "Cancel sign-in" },
      }
  }
}

export function ComputerLoginCard({
  login,
  busy,
  onOpen,
  onAnswer,
}: {
  login: Login
  busy: boolean
  onOpen: () => void | Promise<void>
  onAnswer: (answer: string) => void | boolean | Promise<void | boolean>
}) {
  const locked = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const [opening, setOpening] = useState(false)
  const disabled = busy || submitting || opening
  const copy = computerLoginCopy(login)

  async function answer(text: string) {
    if (locked.current || disabled) return
    locked.current = true
    setSubmitting(true)
    try {
      if ((await onAnswer(text)) === false) locked.current = false
    } catch {
      locked.current = false
    } finally {
      setSubmitting(false)
    }
  }

  async function open() {
    if (disabled) return
    setOpening(true)
    try {
      await onOpen()
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't open Desktop",
        description: "Try again.",
      })
    } finally {
      setOpening(false)
    }
  }

  return (
    <div
      className="relative max-w-sm space-y-3 rounded-xl bg-muted/40 p-3"
      aria-label={copy.title}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="absolute top-2 right-2"
        aria-label={copy.cancel.label}
        disabled={disabled}
        onClick={() => void answer(copy.cancel.answer)}
      >
        <XIcon />
      </Button>
      <div className="space-y-1 pr-6">
        <p className="text-sm font-medium">{copy.title}</p>
        <p className="text-xs text-muted-foreground">{login.hostname}</p>
        <p className="text-xs text-muted-foreground">{copy.body}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          onClick={() => void open()}
        >
          <MonitorIcon />
          {copy.open}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => void answer(copy.done.answer)}
        >
          {copy.done.label}
        </Button>
      </div>
    </div>
  )
}
