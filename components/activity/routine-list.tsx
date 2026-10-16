"use client"

import Link from "next/link"
import { useState } from "react"
import { PlayIcon, Trash2Icon } from "lucide-react"
import { formatDistanceToNowStrict } from "date-fns"

import { deleteRoutine, runRoutineNow, updateRoutine } from "@/actions/routines"
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
import type { PublicRoutine } from "@/lib/routines"

type RoutineBot = Pick<Bot, "id" | "name" | "avatar">

function lastRun(routine: PublicRoutine) {
  if (!routine.lastRunAt) return "Hasn't run yet"
  const ago = formatDistanceToNowStrict(routine.lastRunAt, { addSuffix: true })
  if (routine.lastStatus === "skipped")
    return `Skipped ${ago}${routine.lastError ? `: ${routine.lastError}` : ""}`
  if (routine.lastStatus === "failed") return `Couldn't start ${ago}`
  return `Last ran ${ago}`
}

function RoutineRow({
  routine,
  bot,
}: {
  routine: PublicRoutine
  bot?: RoutineBot
}) {
  const [busy, setBusy] = useState<"toggle" | "run" | "delete">()

  async function toggle(enabled: boolean) {
    setBusy("toggle")
    try {
      await updateRoutine(routine.id, { enabled })
      toast.add({
        type: "success",
        title: enabled ? `${routine.title} resumed` : `${routine.title} paused`,
      })
    } catch {
      toast.add({
        type: "error",
        title: enabled
          ? "Couldn't resume the routine"
          : "Couldn't pause the routine",
        description: "Something went wrong. Try again.",
      })
    } finally {
      setBusy(undefined)
    }
  }

  async function run() {
    setBusy("run")
    try {
      const result = await runRoutineNow(routine.id)
      toast.add(
        result.status === "started"
          ? { type: "success", title: `${routine.title} started` }
          : {
              type: "error",
              title: "Couldn't run the routine",
              description:
                result.status === "skipped"
                  ? "It was skipped. See Recent for why."
                  : "Try again.",
            }
      )
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't run the routine",
        description: "Something went wrong. Try again.",
      })
    } finally {
      setBusy(undefined)
    }
  }

  async function remove() {
    setBusy("delete")
    try {
      await deleteRoutine(routine.id)
      toast.add({ type: "success", title: `${routine.title} deleted` })
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't delete the routine",
        description: "Something went wrong. Try again.",
      })
      setBusy(undefined)
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-muted/60 p-4 sm:flex-row sm:items-center">
      <Link
        href={`/chats/${routine.chatId}`}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {bot && (
          <ChatAvatar seed={bot.avatar} identity={bot.id} className="size-8" />
        )}
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-sm font-medium">{routine.title}</p>
          <p className="text-xs text-muted-foreground">
            {bot ? `${bot.name} · ` : ""}
            {routine.description} · {routine.timezone.replaceAll("_", " ")}
          </p>
          <p className="text-xs text-muted-foreground">
            {routine.enabled && routine.nextRunAt
              ? `Next ${formatDistanceToNowStrict(routine.nextRunAt, { addSuffix: true })} · `
              : routine.enabled
                ? ""
                : "Paused · "}
            {lastRun(routine)}
          </p>
        </div>
      </Link>
      <div className="flex items-center gap-1 self-end sm:self-center">
        <Switch
          checked={routine.enabled}
          disabled={!!busy}
          onCheckedChange={(checked) => void toggle(checked)}
          aria-label={
            routine.enabled
              ? `Pause ${routine.title}`
              : `Resume ${routine.title}`
          }
          className="mr-2"
        />
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={!!busy}
          aria-label={`Run ${routine.title} now`}
          onClick={() => void run()}
        >
          {busy === "run" ? <Spinner /> : <PlayIcon />}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={!!busy}
                aria-label={`Delete ${routine.title}`}
              />
            }
          >
            <Trash2Icon />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {routine.title}?</AlertDialogTitle>
              <AlertDialogDescription>
                The bot stops doing this. Its earlier reports stay in the chat.
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
                Delete routine
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  )
}

export function RoutineList({
  routines,
  bots,
}: {
  routines: PublicRoutine[]
  bots: RoutineBot[]
}) {
  if (!routines.length)
    return (
      <p className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
        No routines yet. Create one here, or ask a bot in chat, for example
        &ldquo;every weekday at 8, summarise my inbox&rdquo;.
      </p>
    )
  return (
    <ul className="flex flex-col gap-2">
      {routines.map((routine) => (
        <RoutineRow
          key={routine.id}
          routine={routine}
          bot={bots.find((bot) => bot.id === routine.botId)}
        />
      ))}
    </ul>
  )
}
