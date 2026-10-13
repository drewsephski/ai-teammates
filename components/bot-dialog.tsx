"use client"

import { useState } from "react"
import { BotSettingsForm } from "@/components/bot-settings-form"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import type { Bot } from "@/db/schema"

// Context-menu editing shares the header panel's fields and validation.
function BotDialog({ bot, trigger = <Button variant="secondary" />, children, open: controlledOpen, onOpenChange }: {
  bot: Bot
  trigger?: React.ReactElement
  children?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen
  return <Dialog open={open} onOpenChange={setOpen}>
    {children && <DialogTrigger render={trigger}>{children}</DialogTrigger>}
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Edit bot</DialogTitle><DialogDescription>Change its identity, role, or appearance.</DialogDescription></DialogHeader>
      <BotSettingsForm bot={bot} inDialog onSaved={() => setOpen(false)} onDeleted={() => setOpen(false)} />
    </DialogContent>
  </Dialog>
}
export { BotDialog }
