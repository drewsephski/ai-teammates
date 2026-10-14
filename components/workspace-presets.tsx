"use client"

import { useState } from "react"
import { useCreateBot } from "@/components/create-bot-button"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { botPresets, type BotPresetId } from "@/lib/bot-presets"
import { cn } from "@/lib/utils"

export function WorkspacePresets({ presetId }: { presetId?: BotPresetId }) {
  const { createWithPreset, pending } = useCreateBot()
  const [creating, setCreating] = useState<BotPresetId>()
  return (
    <section aria-labelledby="workspace-presets-title" className="space-y-4">
      <div className="space-y-1">
        <h2 id="workspace-presets-title" className="text-sm font-medium">
          Start with a preset
        </h2>
        <p className="text-sm text-muted-foreground">
          Pick a role. Your bot is ready to help.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {botPresets.map((preset) => (
          <Button
            key={preset.id}
            variant="ghost"
            aria-label={`Create ${preset.label} bot`}
            disabled={pending}
            aria-busy={pending && creating === preset.id}
            onClick={() => {
              setCreating(preset.id)
              void createWithPreset(preset.id).finally(() =>
                setCreating(undefined)
              )
            }}
            className={cn(
              "h-auto min-h-24 w-full min-w-0 justify-start gap-3 rounded-2xl border border-border/60 px-4 py-4 text-left whitespace-normal",
              preset.id === presetId && "border-foreground/30 bg-muted/40"
            )}
          >
            {pending && preset.id === creating ? (
              <Spinner aria-hidden="true" className="size-4 shrink-0" />
            ) : (
              <preset.icon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
            )}
            <span className="min-w-0 space-y-1">
              <span className="block text-sm font-medium">{preset.label}</span>
              <span className="block text-xs leading-relaxed font-normal text-muted-foreground">
                {preset.summary}
              </span>
            </span>
          </Button>
        ))}
      </div>
    </section>
  )
}
