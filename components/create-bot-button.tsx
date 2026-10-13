"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { nanoid } from "nanoid"
import { PlusIcon } from "lucide-react"
import { createBot } from "@/actions/bot"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { usePaywall } from "@/hooks/use-paywall"
import type { BotPresetId } from "@/lib/bot-presets"

export function useCreateBot(presetId?: BotPresetId) {
  const router = useRouter()
  const { checkPlan, checkUsage } = usePaywall()
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const requestId = useRef<string | null>(null)

  async function create() {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    try {
      if (
        !checkPlan("bots") ||
        !checkPlan("sandboxes") ||
        !(await checkUsage("sandbox")) ||
        !(await checkUsage("ai"))
      )
        return
      requestId.current ??= nanoid()
      const result = await createBot({ requestId: requestId.current, presetId })
      router.push(`/chats/${encodeURIComponent(result.chatId)}`)
      router.refresh()
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't create your bot",
        description: "Try again. Your request won't create a duplicate bot.",
      })
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }
  return { create, pending }
}

export function CreateBotButton({
  presetId,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { presetId?: BotPresetId }) {
  const { create, pending } = useCreateBot(presetId)
  return (
    <Button
      {...props}
      type="button"
      disabled={pending || props.disabled}
      onClick={create}
    >
      {pending ? <Spinner data-icon="inline-start" /> : <PlusIcon />}
      {children ?? "Create a teammate"}
    </Button>
  )
}
