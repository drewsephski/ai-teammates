"use client"

import Link from "next/link"
import { useState } from "react"
import {
  CheckIcon,
  CopyIcon,
  MailIcon,
  Trash2Icon,
  WebhookIcon,
} from "lucide-react"
import { formatDistanceToNowStrict } from "date-fns"

import { deleteTrigger, updateTrigger } from "@/actions/triggers"
import { ChatAvatar } from "@/components/chat-avatar"
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
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import type { Bot } from "@/db/schema"
import type { PublicTrigger } from "@/lib/bot-triggers"

type TriggerBot = Pick<Bot, "id" | "name" | "avatar">

function lastEvent(trigger: PublicTrigger) {
  if (!trigger.lastEventAt) return "No events yet"
  const ago = formatDistanceToNowStrict(trigger.lastEventAt, {
    addSuffix: true,
  })
  const reason = trigger.lastError ? `: ${trigger.lastError}` : ""
  switch (trigger.lastStatus) {
    case "skipped":
      return `Skipped an event ${ago}${reason}`
    case "failed":
      return `Didn't finish ${ago}${reason}`
    case "blocked":
      return `Waiting for you since ${ago}${reason}`
    case "started":
      return `Working on an event from ${ago}`
    default:
      return `Last event ${ago}`
  }
}

function CopyTarget({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex min-w-0 items-center gap-1 rounded-xl bg-background/60 py-1 pr-1 pl-3">
      <code className="min-w-0 flex-1 truncate text-xs">{value}</code>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label={copied ? "Copied" : label}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          } catch {
            toast.add({
              type: "error",
              title: "Couldn't copy",
              description: "Select the text and copy it instead.",
            })
          }
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  )
}

function TriggerRow({
  trigger,
  bot,
}: {
  trigger: PublicTrigger
  bot?: TriggerBot
}) {
  const [busy, setBusy] = useState<"toggle" | "delete">()
  const target = trigger.kind === "email" ? trigger.address : trigger.url
  const Icon = trigger.kind === "email" ? MailIcon : WebhookIcon

  async function toggle(enabled: boolean) {
    setBusy("toggle")
    try {
      await updateTrigger(trigger.id, { enabled })
      toast.add({
        type: "success",
        title: enabled ? `${trigger.title} resumed` : `${trigger.title} paused`,
      })
    } catch {
      toast.add({
        type: "error",
        title: enabled
          ? "Couldn't resume the trigger"
          : "Couldn't pause the trigger",
        description: "Something went wrong. Try again.",
      })
    } finally {
      setBusy(undefined)
    }
  }

  async function remove() {
    setBusy("delete")
    try {
      await deleteTrigger(trigger.id)
      toast.add({ type: "success", title: `${trigger.title} deleted` })
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't delete the trigger",
        description: "Something went wrong. Try again.",
      })
      setBusy(undefined)
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-muted/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href={`/chats/${trigger.chatId}`}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {bot && (
            <ChatAvatar
              seed={bot.avatar}
              identity={bot.id}
              className="size-8"
            />
          )}
          <div className="min-w-0 space-y-0.5">
            <p className="flex items-center gap-1.5 truncate text-sm font-medium">
              <Icon aria-hidden="true" className="size-3.5 shrink-0" />
              {trigger.title}
            </p>
            <p className="text-xs text-muted-foreground">
              {bot ? `${bot.name} · ` : ""}
              {trigger.kind === "email"
                ? "When an email arrives"
                : "When the webhook is called"}
              {trigger.allowedSenders.length
                ? ` from ${trigger.allowedSenders.join(", ")}`
                : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              {trigger.enabled ? "" : "Paused · "}
              {lastEvent(trigger)}
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-1 self-end sm:self-center">
          <Switch
            checked={trigger.enabled}
            disabled={!!busy}
            onCheckedChange={(checked) => void toggle(checked)}
            aria-label={
              trigger.enabled
                ? `Pause ${trigger.title}`
                : `Resume ${trigger.title}`
            }
            className="mr-2"
          />
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={!!busy}
                  aria-label={`Delete ${trigger.title}`}
                />
              }
            >
              <Trash2Icon />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {trigger.title}?</AlertDialogTitle>
                <AlertDialogDescription>
                  {trigger.kind === "email"
                    ? "Mail to its address stops reaching the bot."
                    : "Calls to its URL stop reaching the bot."}{" "}
                  Its earlier reports stay in the chat.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy === "delete"}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  type="button"
                  variant="destructive"
                  disabled={busy === "delete"}
                  onClick={() => void remove()}
                >
                  {busy === "delete" && <Spinner data-icon="inline-start" />}
                  Delete trigger
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      {target && (
        <CopyTarget
          value={target}
          label={
            trigger.kind === "email" ? "Copy email address" : "Copy webhook URL"
          }
        />
      )}
    </li>
  )
}

export function TriggerList({
  triggers,
  bots,
}: {
  triggers: PublicTrigger[]
  bots: TriggerBot[]
}) {
  if (!triggers.length)
    return (
      <p className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
        No triggers yet. Give a bot a webhook URL or an email address, and it
        starts work when a pull request opens, a payment fails or an invoice
        arrives.
      </p>
    )
  return (
    <ul className="flex flex-col gap-2">
      {triggers.map((trigger) => (
        <TriggerRow
          key={trigger.id}
          trigger={trigger}
          bot={bots.find((bot) => bot.id === trigger.botId)}
        />
      ))}
    </ul>
  )
}
