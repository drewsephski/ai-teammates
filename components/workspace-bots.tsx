"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowUpRightIcon } from "lucide-react"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { WorkspaceBot } from "@/lib/workspace-activity"

const activityLabels = {
  working: "Working",
  queued: "Queued",
  ready: "Ready",
  setup: "Finish setup",
  unknown: "Activity unavailable",
}

export function WorkspaceBots({ bots }: { bots: WorkspaceBot[] }) {
  const [view, setView] = useState<"all" | "running">("all")
  const active = bots.filter(
    (bot) => bot.activity === "working" || bot.activity === "queued"
  )
  const shown =
    view === "running"
      ? active
      : [...active, ...bots.filter((bot) => !active.includes(bot))]
  const unavailable = bots.some((bot) => bot.activity === "unknown")
  return (
    <section aria-labelledby="workspace-bots-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1
          id="workspace-bots-title"
          className="text-lg font-medium tracking-tight"
        >
          Your bots{" "}
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            {bots.length}
          </span>
        </h1>
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Bot view"
        >
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={view === "all"}
            onClick={() => setView("all")}
            className={cn(view !== "all" && "text-muted-foreground")}
          >
            All bots
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={view === "running"}
            onClick={() => setView("running")}
            className={cn(view !== "running" && "text-muted-foreground")}
          >
            Running
            {active.length > 0 && (
              <span className="text-muted-foreground"> {active.length}</span>
            )}
          </Button>
        </div>
      </div>
      {shown.length ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((bot) => (
            <li key={bot.id}>
              <Link
                href={
                  bot.chatId
                    ? `/chats/${encodeURIComponent(bot.chatId)}`
                    : "/workspace"
                }
                aria-label={`Open ${bot.name}`}
                className="group flex h-full min-h-36 flex-col gap-4 rounded-2xl border border-border/60 p-4 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ChatAvatar
                    seed={bot.avatar}
                    identity={bot.id}
                    state={
                      bot.activity === "working"
                        ? "working"
                        : bot.activity === "queued"
                          ? "queued"
                          : "idle"
                    }
                    interactive
                    className="size-9"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{bot.name}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {bot.job === "Not configured" ? "Custom bot" : bot.job}
                    </p>
                  </div>
                  <ArrowUpRightIcon
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  />
                </div>
                <span className="mt-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-1.5 rounded-full",
                      bot.activity === "working"
                        ? "bg-foreground"
                        : "bg-muted-foreground/40"
                    )}
                  />
                  {activityLabels[bot.activity]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-5 text-sm text-muted-foreground">
          {view === "running"
            ? unavailable
              ? "Bot activity is temporarily unavailable. It will refresh automatically."
              : "No bots are running right now."
            : "Choose a preset below or create a custom bot to get started."}
        </p>
      )}
    </section>
  )
}
