"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { XIcon } from "lucide-react"
import type { Bot } from "@/db/schema"
import { useIsMobile } from "@/hooks/use-mobile"
import { BotSettingsForm } from "@/components/bot-settings-form"
import { useDesktopPanel } from "@/components/desktop-panel"
import { Button } from "@/components/ui/button"
import { ResizableHandle, ResizablePanel } from "@/components/ui/resizable"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

type SettingsContext = {
  open: boolean
  show: () => void
  close: (restoreFocus?: boolean) => void
}
const Settings = createContext<SettingsContext | null>(null)
export function useBotSettings() {
  const context = useContext(Settings)
  if (!context) throw new Error("Bot settings require BotSettingsProvider.")
  return context
}
export function BotSettingsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const desktop = useDesktopPanel()
  return (
    <Settings
      value={{
        open,
        show: () => {
          desktop.close()
          setOpen(true)
        },
        close: (restoreFocus = true) => {
          setOpen(false)
          if (restoreFocus)
            document.getElementById("bot-settings-trigger")?.focus()
        },
      }}
    >
      {children}
    </Settings>
  )
}
export function BotSettingsPanel({ bot }: { bot: Bot }) {
  const { open, close } = useBotSettings()
  const mobile = useIsMobile()
  if (!open) return null
  const form = (
    <BotSettingsForm key={bot.id} bot={bot} onDeleted={() => close(false)} />
  )
  if (mobile)
    return (
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) close(false)
        }}
      >
        <SheetContent
          id="bot-config-panel"
          className="gap-0 data-[side=right]:w-full"
          finalFocus={() => document.getElementById("bot-settings-trigger")}
        >
          <SheetHeader className="shrink-0 border-b border-border/60 pr-12">
            <SheetTitle>Bot settings</SheetTitle>
            <SheetDescription>Identity, role, and appearance.</SheetDescription>
          </SheetHeader>
          {form}
        </SheetContent>
      </Sheet>
    )
  return (
    <>
      <ResizableHandle />
      <ResizablePanel
        id="bot-settings"
        defaultSize="360px"
        minSize="280px"
        maxSize="480px"
      >
        <aside
          id="bot-config-panel"
          aria-labelledby="bot-settings-title"
          className="flex h-full min-h-0 flex-col bg-card"
        >
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-4">
            <h2 id="bot-settings-title" className="text-sm font-medium">
              Bot settings
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Close bot settings"
              onClick={() => close()}
            >
              <XIcon />
            </Button>
          </header>
          {form}
        </aside>
      </ResizablePanel>
    </>
  )
}
