"use client"

import { useRef, useState } from "react"
import { MonitorIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"

type Login = { service: string; hostname: string }

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
      toast.add({ type: "error", title: "Couldn't open sign-in. Try again." })
    } finally {
      setOpening(false)
    }
  }

  return (
    <div
      className="relative max-w-sm space-y-3 rounded-xl bg-muted/40 p-3"
      aria-label={`Sign in to ${login.service}`}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="absolute top-2 right-2"
        aria-label="Cancel sign-in"
        disabled={disabled}
        onClick={() => void answer("Cancel sign-in")}
      >
        <XIcon />
      </Button>
      <div className="space-y-1 pr-6">
        <p className="text-sm font-medium">Sign in to {login.service}</p>
        <p className="text-xs text-muted-foreground">{login.hostname}</p>
        <p className="text-xs text-muted-foreground">
          Sign in on my computer, then I’ll continue. Keep passwords and codes
          out of chat.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          onClick={() => void open()}
        >
          <MonitorIcon />
          Open sign-in
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => void answer("I'm signed in")}
        >
          I’m signed in
        </Button>
      </div>
    </div>
  )
}
