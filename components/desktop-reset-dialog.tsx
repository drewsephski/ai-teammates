"use client"

import { useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"

export function DesktopResetDialog({ reset }: { reset: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  async function confirm() {
    setPending(true)
    try {
      await reset()
      setOpen(false)
      toast.add({ type: "success", title: "New computer created" })
    } catch {
      toast.add({
        type: "error",
        title: "Could not reset the computer",
        description: "Try again shortly.",
      })
    } finally {
      setPending(false)
    }
  }
  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger render={<Button variant="outline" />}>
        Reset computer
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Start a new computer?</AlertDialogTitle>
          <AlertDialogDescription>
            The previous computer no longer exists. This creates an empty
            computer. Its previous files and open applications cannot be
            recovered. Your conversations and memory stay available.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction type="button" disabled={pending} onClick={confirm}>
            {pending && <Spinner data-icon="inline-start" />}
            Create new computer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
