"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRightIcon, RefreshCwIcon } from "lucide-react"
import { getForYouSuggestion, startForYouTask } from "@/actions/for-you"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import type { ForYouCard } from "@/lib/for-you-token"

export function WorkspaceForYou({
  apps,
  botIds,
  appsUnavailable,
}: {
  apps: { slug: string; name: string; accountId?: string }[]
  botIds: string[]
  appsUnavailable: boolean
}) {
  const router = useRouter()
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{
    key: string
    card: ForYouCard | null
    reason?: string
    error?: string
  }>()
  const [launching, setLaunching] = useState(false)
  const eligible = apps.length > 0 && botIds.length > 0 && !appsUnavailable
  const key = `${apps
    .map((app) => `${app.slug}:${app.accountId ?? ""}`)
    .sort()
    .join(",")}|${[...botIds].sort().join(",")}|${revision}`
  useEffect(() => {
    if (!eligible) return
    let current = true
    void getForYouSuggestion()
      .then((result) => {
        if (current) setState({ key, ...result })
      })
      .catch(() => {
        if (current)
          setState({
            key,
            card: null,
            error: "Couldn't check your connected apps. Try again.",
          })
      })
    return () => {
      current = false
    }
  }, [key, eligible])
  const current = eligible && state?.key === key ? state : undefined
  const loading = eligible && !current
  const card = current?.card
  async function start() {
    if (!card || launching) return
    setLaunching(true)
    try {
      const result = await startForYouTask(card.token)
      router.push(`/chats/${encodeURIComponent(result.chatId)}`)
      router.refresh()
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't start this task",
        description:
          "Refresh For you and try again. Your request won't start a duplicate task.",
      })
    } finally {
      setLaunching(false)
    }
  }
  const message = appsUnavailable
    ? "App connections are temporarily unavailable."
    : !apps.length || current?.reason === "no-apps"
      ? "Connect an app to find useful next tasks."
      : !botIds.length || current?.reason === "no-bots"
        ? "Choose a bot preset to get started."
        : current?.reason === "usage"
          ? "Your AI allowance is too low to check for new tasks."
          : (current?.error ??
            "No actionable tasks found in the recent records checked.")
  return (
    <section aria-labelledby="workspace-for-you-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="workspace-for-you-title" className="text-sm font-medium">
          For you
        </h2>
        {eligible && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Refresh For you"
            disabled={loading || launching}
            onClick={() => setRevision((value) => value + 1)}
          >
            <RefreshCwIcon
              aria-hidden="true"
              className="size-3.5 text-muted-foreground"
            />
          </Button>
        )}
      </div>
      {loading ? (
        <div
          role="status"
          className="flex items-center gap-2 py-3 text-sm text-muted-foreground"
        >
          <Spinner aria-hidden="true" className="size-3.5" />
          Looking through your connected apps…
        </div>
      ) : card ? (
        <div className="space-y-3 rounded-2xl border border-border/60 p-4 sm:p-5">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">{card.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {card.prompt}
            </p>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {apps.find((app) => app.slug === card.toolkit)?.name ??
              card.toolkit}{" "}
            · {card.description}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={launching}
            onClick={start}
          >
            {launching ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : (
              <ArrowUpRightIcon aria-hidden="true" />
            )}
            Start task
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{message}</p>
      )}
    </section>
  )
}
