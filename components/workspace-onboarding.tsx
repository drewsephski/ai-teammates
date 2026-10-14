"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { ArrowRightIcon, PlusIcon } from "lucide-react"
import { useCreateBot } from "@/components/create-bot-button"
import { WorkspaceOnboardingFlow } from "@/components/workspace-onboarding-flow"
import { Button } from "@/components/ui/button"
import { botPresets, type BotPresetId } from "@/lib/bot-presets"
import { ConnectorMarketplace } from "@/components/connector-marketplace"

function WorkspaceOnboarding(props: {
  initialPresetId?: BotPresetId
  onSkip: () => void
}) {
  const { createWithPreset, pending } = useCreateBot()
  return (
    <WorkspaceOnboardingFlow
      {...props}
      onCreate={createWithPreset}
      pending={pending}
      renderConnections={(presetId) => (
        <div className="mt-4 flex flex-wrap gap-2">
          {botPresets
            .find((preset) => preset.id === presetId)
            ?.suggestedApps.map((app) => (
              <ConnectorMarketplace
                key={app}
                initialSearch={app}
                trigger={<Button variant="outline" disabled={pending} />}
              >
                <PlusIcon aria-hidden="true" /> {app}
              </ConnectorMarketplace>
            ))}
          <ConnectorMarketplace
            trigger={<Button variant="outline" disabled={pending} />}
          >
            <PlusIcon aria-hidden="true" />{" "}
            {presetId ? "Find another app" : "Find an app to connect"}
          </ConnectorMarketplace>
        </div>
      )}
    />
  )
}

const dismissalEvent = "krafty:onboarding-dismissed"
function subscribeToDismissal(callback: () => void) {
  window.addEventListener("storage", callback)
  window.addEventListener(dismissalEvent, callback)
  return () => {
    window.removeEventListener("storage", callback)
    window.removeEventListener(dismissalEvent, callback)
  }
}

export function WorkspaceOnboardingGate({
  userId,
  initialPresetId,
  children,
}: {
  userId: string
  initialPresetId?: BotPresetId
  children: React.ReactNode
}) {
  const storageKey = `krafty:onboarding:v1:${userId}`
  const [override, setOverride] = useState<boolean>()
  const storedDismissal = useSyncExternalStore(
    subscribeToDismissal,
    () => {
      try {
        return localStorage.getItem(storageKey) === "skipped"
      } catch {
        return false
      }
    },
    () => false
  )
  const skipped = override ?? storedDismissal
  const container = useRef<HTMLDivElement>(null)
  const previousSkipped = useRef(skipped)

  useEffect(() => {
    if (previousSkipped.current !== skipped) {
      const target = skipped
        ? container.current?.querySelector<HTMLButtonElement>("button")
        : container.current?.querySelector<HTMLHeadingElement>("h1")
      target?.focus()
    }
    previousSkipped.current = skipped
  }, [skipped])

  function setSkipped(value: boolean) {
    try {
      if (value) localStorage.setItem(storageKey, "skipped")
      else localStorage.removeItem(storageKey)
      setOverride(undefined)
      window.dispatchEvent(new Event(dismissalEvent))
    } catch {
      // Private/blocked storage still permits skipping for this visit.
      setOverride(value)
    }
  }

  return (
    <div ref={container}>
      {!skipped ? (
        <WorkspaceOnboarding
          initialPresetId={initialPresetId}
          onSkip={() => setSkipped(true)}
        />
      ) : (
        <>
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-5 pt-6 sm:px-8">
            <p className="text-sm text-muted-foreground">
              A little guidance whenever you need it.
            </p>
            <Button variant="outline" onClick={() => setSkipped(false)}>
              Resume getting started <ArrowRightIcon aria-hidden="true" />
            </Button>
          </div>
          {children}
        </>
      )}
    </div>
  )
}
