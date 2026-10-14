"use client"

import { useRef, useState, useTransition } from "react"
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
  const { checkPlan, showUsageLimit } = usePaywall()
  const [pending, setPending] = useState(false)
  const [navigating, startNavigation] = useTransition()
  const inFlight = useRef(false)
  const requests = useRef(new Map<string, string>())

  async function createWithPreset(selectedPresetId?: BotPresetId) {
    if (inFlight.current || navigating) return
    inFlight.current = true
    setPending(true)
    try {
      if (!checkPlan("bots")) return
      const requestKey = selectedPresetId ?? "custom"
      const requestId = requests.current.get(requestKey) ?? nanoid()
      requests.current.set(requestKey, requestId)
      const result = await createBot({ requestId, presetId: selectedPresetId })
      if (!result.ok) {
        if ("planLimit" in result) {
          toast.add({
            type: "error",
            title: "Your free bot is already created",
            description:
              "The free plan includes one bot. Upgrade to add more teammates.",
            actionProps: {
              children: "See plans",
              onClick: () => router.push("/pricing"),
            },
          })
          return
        }
        showUsageLimit(result.usageLimit)
        return
      }
      // A sidebar creator survives navigation, so release it when the route settles.
      startNavigation(() => {
        router.push(`/chats/${encodeURIComponent(result.chatId)}`)
        router.refresh()
      })
      requests.current.delete(requestKey)
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
  return {
    create: () => createWithPreset(presetId),
    createWithPreset,
    pending: pending || navigating,
  }
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
