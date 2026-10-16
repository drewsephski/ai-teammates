"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  ClockIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react"

import {
  refreshForYou,
  startForYouItem,
  updateForYouItem,
} from "@/actions/for-you"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { ForYouItemView, ForYouState } from "@/services/for-you"

const urgencyLabels = {
  today: "Today",
  this_week: "This week",
  later: null,
} as const

function since(iso: string | null, now: number) {
  if (!iso) return null
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000))
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`
}

function list(names: string[]) {
  if (names.length <= 2) return names.join(" and ")
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}

export function WorkspaceForYou({
  initial,
  apps,
  hasBots,
  appsUnavailable,
}: {
  initial: ForYouState | null
  apps: { slug: string; name: string }[]
  hasBots: boolean
  appsUnavailable: boolean
}) {
  const router = useRouter()
  const [state, setState] = useState(initial)
  const [scanning, setScanning] = useState(false)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState<string>()
  const [now, setNow] = useState(() => Date.now())
  const eligible = apps.length > 0 && hasBots && !appsUnavailable
  const autoScanned = useRef(false)

  // The page refreshes from the server every few seconds; a scan another tab
  // started shows up here without a second scan.
  const [synced, setSynced] = useState(initial)
  if (initial !== synced && !scanning) {
    setSynced(initial)
    if (initial) setState(initial)
  }

  // Keeps "Checked … 4m ago" current
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  async function scan(force: boolean) {
    setScanning(true)
    try {
      const result = await refreshForYou(force)
      setState(result)
      setHidden(new Set())
    } catch {
      setState((current) =>
        current
          ? {
              ...current,
              error:
                "Couldn't check your connected apps. Try again in a minute.",
            }
          : current
      )
    } finally {
      setScanning(false)
      setNow(Date.now())
    }
  }

  useEffect(() => {
    if (!eligible || autoScanned.current || !initial?.scan.stale) return
    autoScanned.current = true
    // Scan once per visit when the stored suggestions are stale
    void scan(false)
  }, [eligible, initial?.scan.stale])

  async function start(item: ForYouItemView) {
    setBusy(item.id)
    try {
      const { chatId } = await startForYouItem(item.id)
      router.push(`/chats/${encodeURIComponent(chatId)}`)
      router.refresh()
    } catch (error) {
      toast.add({
        type: "error",
        title: "Couldn't start this task",
        description:
          error instanceof Error && error.message.length < 120
            ? error.message
            : "Refresh For you and try again.",
      })
      setBusy(undefined)
    }
  }

  async function feedback(
    item: ForYouItemView,
    action: Parameters<typeof updateForYouItem>[1],
    message: string
  ) {
    setHidden((current) => new Set(current).add(item.id))
    try {
      await updateForYouItem(item.id, action)
      toast.add({ title: message })
    } catch {
      setHidden((current) => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
      toast.add({ type: "error", title: "Couldn't update this suggestion" })
    }
  }

  const items = (state?.items ?? []).filter((item) => !hidden.has(item.id))
  const running = scanning || state?.scan.status === "running"
  const nameOf = (slug: string) =>
    apps.find((app) => app.slug === slug)?.name ?? slug
  const checkedNames = (state?.scan.checked ?? []).map(nameOf)
  const failedNames = (state?.scan.failed ?? []).map(nameOf)

  const meta = running
    ? `Checking ${list(apps.slice(0, 4).map((app) => app.name))}…`
    : checkedNames.length
      ? `Checked ${list(checkedNames)} · ${since(state?.scan.finishedAt ?? null, now)}`
      : null

  const empty = appsUnavailable
    ? "App connections are temporarily unavailable."
    : !apps.length || state?.reason === "no-apps"
      ? "Connect an app and your teammates will find work worth doing."
      : !hasBots || state?.reason === "no-bots"
        ? "Finish setting up a bot to get suggestions."
        : state?.reason === "usage"
          ? "Your AI allowance is too low to check for new tasks."
          : (state?.error ??
            (state?.scan.status === "never"
              ? "Your teammates haven't looked yet."
              : "Nothing needs you right now. Check back later."))

  return (
    <section aria-labelledby="workspace-for-you-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="workspace-for-you-title" className="text-sm font-medium">
            For you
          </h2>
          {eligible && meta && (
            <p
              className="truncate text-xs text-muted-foreground"
              role={running ? "status" : undefined}
            >
              {meta}
            </p>
          )}
        </div>
        {eligible && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Check again"
            disabled={running}
            onClick={() => scan(true)}
          >
            {running ? (
              <Spinner aria-hidden="true" className="size-3.5" />
            ) : (
              <RefreshCwIcon
                aria-hidden="true"
                className="size-3.5 text-muted-foreground"
              />
            )}
          </Button>
        )}
      </div>

      {items.length ? (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <ForYouCard
              key={item.id}
              item={item}
              featured={index === 0}
              starting={busy === item.id}
              disabled={busy !== undefined}
              onStart={() => start(item)}
              onSnooze={() =>
                feedback(item, { type: "snooze" }, "Snoozed until tomorrow")
              }
              onDismiss={(reason) =>
                feedback(
                  item,
                  { type: "dismiss", reason },
                  reason === "done"
                    ? "Marked as done"
                    : "Got it. You'll see fewer like this."
                )
              }
            />
          ))}
        </ul>
      ) : running && eligible ? (
        <div className="space-y-2" aria-hidden="true">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}

      {eligible && !running && (
        <>
          {items.length > 0 && state?.error && (
            <p className="text-xs text-muted-foreground">{state.error}</p>
          )}
          {failedNames.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Couldn&apos;t read {list(failedNames)}. Reconnecting it in Apps
              may help.
            </p>
          )}
        </>
      )}
    </section>
  )
}

function ForYouCard({
  item,
  featured,
  starting,
  disabled,
  onStart,
  onSnooze,
  onDismiss,
}: {
  item: ForYouItemView
  featured: boolean
  starting: boolean
  disabled: boolean
  onStart: () => void
  onSnooze: () => void
  onDismiss: (reason: "not_relevant" | "done" | "wrong_bot") => void
}) {
  const [open, setOpen] = useState(false)
  const urgency = urgencyLabels[item.urgency]
  return (
    <li
      className={cn(
        "rounded-2xl border border-border/60",
        featured ? "space-y-3 p-4 sm:p-5" : "space-y-2 px-4 py-3"
      )}
    >
      <div className="flex items-start gap-3">
        <ChatAvatar
          seed={item.bot.avatar}
          identity={item.bot.id}
          state="idle"
          className={cn("mt-0.5", featured ? "size-7" : "size-6")}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">
              {item.bot.name}
            </span>
            {urgency && (
              <span className="rounded-full bg-muted px-1.5 py-px text-[11px] text-foreground/80">
                {urgency}
              </span>
            )}
            {item.sourceUrl ? (
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-w-0 items-center gap-0.5 truncate underline-offset-2 hover:text-foreground hover:underline"
              >
                {item.app} · {item.sourceLabel}
                <ArrowUpRightIcon aria-hidden="true" className="size-3" />
              </a>
            ) : (
              <span className="truncate">
                {item.app} · {item.sourceLabel}
              </span>
            )}
          </div>
          <h3 className="text-sm font-medium">{item.title}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {item.reason}
          </p>
          {open && (
            <div className="space-y-2 pt-1 text-sm leading-relaxed">
              <p>{item.prompt}</p>
              <blockquote className="border-l-2 border-border pl-3 text-xs text-muted-foreground">
                “{item.quote}”
              </blockquote>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-9 sm:pl-10">
        <Button
          variant={featured ? "default" : "outline"}
          size="sm"
          disabled={disabled}
          onClick={onStart}
        >
          {starting ? (
            <Spinner aria-hidden="true" data-icon="inline-start" />
          ) : (
            <ArrowUpRightIcon aria-hidden="true" data-icon="inline-start" />
          )}
          Start
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="text-muted-foreground"
        >
          {open ? "Hide details" : "Details"}
          <ChevronDownIcon
            aria-hidden="true"
            data-icon="inline-end"
            className={cn("transition-transform", open && "rotate-180")}
          />
        </Button>
        <div className="ml-auto flex items-center">
          <Tooltip>
            <TooltipTrigger
              disabled={disabled}
              onClick={onSnooze}
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Not now" />
              }
            >
              <ClockIcon aria-hidden="true" className="text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>Not now</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <Tooltip>
              <DropdownMenuTrigger
                disabled={disabled}
                render={
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Dismiss"
                      />
                    }
                  />
                }
              >
                <XIcon aria-hidden="true" className="text-muted-foreground" />
              </DropdownMenuTrigger>
              <TooltipContent>Dismiss</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Dismiss because…</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => onDismiss("done")}>
                  Already done
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDismiss("not_relevant")}>
                  Not relevant to me
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDismiss("wrong_bot")}>
                  Wrong teammate
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  )
}
