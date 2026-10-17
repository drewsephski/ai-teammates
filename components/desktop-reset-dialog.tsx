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

export function DesktopResetDialog({
  reset,
}: {
  // Expected refusals (time used up, computers busy) come back as data
  reset: () => Promise<{ ok: true } | { ok: false; message: string }>
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  async function confirm() {
    setPending(true)
    try {
      const result = await reset()
      if (!result.ok) {
        toast.add({
          type: "error",
          title: "Couldn't reset the computer",
          description: result.message,
        })
        return
      }
      setOpen(false)
      toast.add({ type: "success", title: "Computer reset" })
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't reset the computer",
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
          <AlertDialogTitle>Reset the computer?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes its files and browser sign-ins for all your bots. This
            can&apos;t be undone. Your conversations and memory stay available.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction type="button" disabled={pending} onClick={confirm}>
            {pending && <Spinner data-icon="inline-start" />}
            Reset computer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
