"use client"

import { useState } from "react"

import { disconnectSlack, updateSlackSettings } from "@/actions/slack"
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
import { Button, buttonVariants } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import type { Bot } from "@/db/schema"
import type { SlackStatus } from "@/lib/slack"

type SlackBot = Pick<Bot, "id" | "name">

// The value the Select uses for "the first bot"
const FIRST = "first"

export function SlackCard({
  status,
  bots,
}: {
  status: SlackStatus
  bots: SlackBot[]
}) {
  const [busy, setBusy] = useState<"bot" | "disconnect">()

  if (!status.available)
    return (
      <p className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
        Slack isn&apos;t set up on this server yet.
      </p>
    )

  if (!status.connected)
    return (
      <div className="flex flex-col gap-3 rounded-2xl bg-muted/60 p-4 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-muted-foreground">
          Message your bots from Slack. Send the Krafty app a direct message, or
          mention it in a channel, and the bot answers in the thread.
        </p>
        <a
          href="/api/slack/install"
          className={buttonVariants({ size: "sm", className: "self-start" })}
        >
          Add to Slack
        </a>
      </div>
    )

  async function pickBot(value: string) {
    setBusy("bot")
    try {
      await updateSlackSettings({ botId: value === FIRST ? null : value })
      toast.add({ type: "success", title: "Slack settings saved" })
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't save Slack settings",
        description: "Something went wrong. Try again.",
      })
    } finally {
      setBusy(undefined)
    }
  }

  async function disconnect() {
    setBusy("disconnect")
    try {
      await disconnectSlack()
      toast.add({ type: "success", title: "Slack disconnected" })
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't disconnect Slack",
        description: "Something went wrong. Try again.",
      })
      setBusy(undefined)
    }
  }

  const items = {
    [FIRST]: bots[0] ? `${bots[0].name} (your first bot)` : "Your first bot",
    ...Object.fromEntries(bots.map((bot) => [bot.id, bot.name])),
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-muted/60 p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Connected to {status.teamName}</p>
        <p className="text-sm text-muted-foreground">
          Only you can talk to your bots there. Start a message with a
          bot&apos;s name and a colon, like &ldquo;Scout: check the
          build&rdquo;, to pick who answers.
        </p>
      </div>
      <Field>
        <FieldLabel htmlFor="slack-bot">Answers by default</FieldLabel>
        <Select
          items={items}
          value={status.botId ?? FIRST}
          disabled={!!busy}
          onValueChange={(value) => void pickBot(String(value))}
        >
          <SelectTrigger id="slack-bot" className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FIRST}>{items[FIRST]}</SelectItem>
            {bots.map((bot) => (
              <SelectItem key={bot.id} value={bot.id}>
                {bot.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>
          Replies come back in the Slack thread and stay in the bot&apos;s chat
          here.
        </FieldDescription>
      </Field>
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              disabled={!!busy}
            />
          }
        >
          Disconnect Slack
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Slack?</AlertDialogTitle>
            <AlertDialogDescription>
              Messages in {status.teamName} stop reaching your bots. Earlier
              conversations stay in their chats.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "disconnect"}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              disabled={busy === "disconnect"}
              onClick={() => void disconnect()}
            >
              {busy === "disconnect" && <Spinner data-icon="inline-start" />}
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
