"use client"

import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import Link from "next/link"
import { useState } from "react"
import { ChevronDownIcon, PlayIcon, Trash2Icon } from "lucide-react"
import { format, formatDistanceToNowStrict } from "date-fns"

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
import type { PublicRoutine, PublicRoutineRun } from "@/lib/routines"
import { formatSpend } from "@/lib/turn-spend"
import { cn } from "@/lib/utils"

type RoutineBot = Pick<Bot, "id" | "name" | "avatar">
type RoutineWithRuns = PublicRoutine & { recentRuns?: PublicRoutineRun[] }

const runStatusLabels: Record<PublicRoutineRun["status"], string> = {
  started: "Running",
  completed: "Done",
  blocked: "Waiting for you",
  failed: "Didn't finish",
  skipped: "Skipped",
}

function RunList({ id, runs }: { id: string; runs: PublicRoutineRun[] }) {
  return (
    <ul
      id={id}
      className="flex flex-col gap-1.5 border-t border-border/60 pt-3"
    >
      {runs.map((run) => (
        <li
          key={run.id}
          className="flex items-baseline gap-3 text-xs text-muted-foreground"
        >
          <time
            dateTime={new Date(run.scheduledAt).toISOString()}
            className="w-32 shrink-0 tabular-nums"
          >
            {format(run.scheduledAt, "EEE, MMM d, h:mm a")}
          </time>
          <span className="min-w-0 flex-1 truncate">
            <span
              className={cn(
                run.status === "completed" ? "text-foreground" : undefined
              )}
            >
              {runStatusLabels[run.status]}
            </span>
            {run.detail ? ` · ${run.detail}` : ""}
          </span>
          {run.spent > 0 && (
            <Tooltip>
              <TooltipTrigger
                tabIndex={0}
                render={
                  <span className="shrink-0 tabular-nums">
                    {formatSpend(run.spent)}
                  </span>
                }
              />
              <TooltipContent>
                {"AI allowance this run used, after any credit"}
              </TooltipContent>
            </Tooltip>
          )}
        </li>
      ))}
    </ul>
  )
}

function lastRun(routine: PublicRoutine) {
  if (!routine.lastRunAt) return "Hasn't run yet"
  const ago = formatDistanceToNowStrict(routine.lastRunAt, { addSuffix: true })
  const reason = routine.lastError ? `: ${routine.lastError}` : ""
  switch (routine.lastStatus) {
    case "skipped":
      return `Skipped ${ago}${reason}`
    case "failed":
      // The run never started, or started and didn't finish
      return routine.lastError === "Couldn't start the run."
        ? `Couldn't start ${ago}`
        : `Didn't finish ${ago}${reason}`
    case "blocked":
      return `Waiting for you since ${ago}${reason}`
    case "started":
      return `Started ${ago}`
    default:
      return `Last ran ${ago}`
  }
}

function RoutineRow({
  routine,
  bot,
}: {
  routine: RoutineWithRuns
  bot?: RoutineBot
}) {
  const [busy, setBusy] = useState<"toggle" | "run" | "delete">()
  const [showRuns, setShowRuns] = useState(false)
  const runs = routine.recentRuns ?? []
  const runsId = `routine-runs-${routine.id}`

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
    <li className="flex flex-col gap-3 rounded-2xl bg-muted/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href={`/chats/${routine.chatId}`}
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
                  The bot stops doing this. Its earlier reports stay in the
                  chat.
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
      </div>
      {runs.length > 0 && (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-fit text-muted-foreground"
            aria-expanded={showRuns}
            aria-controls={runsId}
            onClick={() => setShowRuns((shown) => !shown)}
          >
            Recent runs
            <ChevronDownIcon
              data-icon="inline-end"
              className={cn("transition-transform", showRuns && "rotate-180")}
            />
          </Button>
          {showRuns && <RunList id={runsId} runs={runs} />}
        </div>
      )}
    </li>
  )
}

export function RoutineList({
  routines,
  bots,
}: {
  routines: RoutineWithRuns[]
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
