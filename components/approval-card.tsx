"use client"

import { useCallback, useEffect, useState } from "react"
import { MonitorIcon, ShieldCheckIcon } from "lucide-react"

import {
  approvalActionLabel,
  approvalPreviewSrc,
} from "@/components/approval-text"
import { EmailDraftCard } from "@/components/email-draft-card"
import type { EmailDraft } from "@/lib/email-draft"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import type { ApprovalDecision } from "@/db/schema"

// Loaded on demand: chat code that never shows an approval (and its tests)
// shouldn't pull the server action module in
const actions = () => import("@/actions/approvals")
type Actions = Pick<
  Awaited<ReturnType<typeof actions>>,
  "getApproval" | "decideApproval" | "actOnEmailDraft"
>

type State =
  | "loading"
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "running"
  | "executed"
  | "failed"
  | "unavailable"

const settled: Partial<Record<State, string>> = {
  approved: "Approved",
  running: "Approved. The outcome wasn't confirmed; check with the bot",
  executed: "Approved and done",
  failed: "Approved, but it didn't go through",
  denied: "Declined",
  expired: "Expired",
  unavailable: "No longer available",
}

// What the card learns from the request itself. A computer approval holds a
// step on the bot's computer: no "Always allow", a hostname and a screenshot.
type Detail = {
  kind?: "app" | "computer"
  hostname?: string | null
  action?: string | null
  alwaysAllowed?: boolean
  preview?: string | null
  // A held shell command, shown exactly as it will run
  command?: string | null
}

// The screenshot the bot asked about, small until the person wants a closer look
function ApprovalPreview({ src, alt }: { src: string; alt: string }) {
  return (
    <Dialog>
      <DialogTrigger
        aria-label="Enlarge the screenshot"
        className="block w-full cursor-zoom-in overflow-hidden rounded-lg ring-1 ring-foreground/10 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* A data URL from the server: next/image has nothing to optimise */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="max-h-48 w-full object-cover object-top"
        />
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Screenshot</DialogTitle>
          <DialogDescription>{alt}</DialogDescription>
        </DialogHeader>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="w-full rounded-lg" />
      </DialogContent>
    </Dialog>
  )
}

// An external action a bot is holding for the owner. The card reads the
// request's current state, so it stays right after a reload or a decision
// made on another device.
export function ApprovalCard({
  approvalId,
  summary,
  toolkit,
  api,
}: {
  approvalId: string
  summary: string
  toolkit?: string
  /** Injected in tests; defaults to the approvals server actions. */
  api?: Actions
}) {
  const load = useCallback(
    () => (api ? Promise.resolve(api) : actions()),
    [api]
  )
  const [state, setState] = useState<State>("loading")
  const [emailDraft, setEmailDraft] = useState<EmailDraft>()
  const [detail, setDetail] = useState<Detail>({})
  const [pending, setPending] = useState<ApprovalDecision>()

  useEffect(() => {
    let current = true
    load()
      .then(({ getApproval }) => getApproval(approvalId))
      .then(
        (approval) => {
          if (!current) return
          setState(approval.state)
          setEmailDraft(approval.emailDraft)
          setDetail({
            kind: approval.kind,
            hostname: approval.hostname,
            action: approval.action,
            alwaysAllowed: approval.alwaysAllowed,
            // The action passes the screenshot through when the server has one
            preview: approval.preview,
            command: approval.command,
          })
        },
        () => current && setState("unavailable")
      )
    return () => {
      current = false
    }
  }, [approvalId, load])

  useEffect(() => {
    if (!emailDraft || !["pending", "approved", "running"].includes(state))
      return
    let current = true
    const refresh = async () => {
      try {
        const approval = await (await load()).getApproval(approvalId)
        if (current) setState(approval.state)
      } catch {
        /* Keep the saved card through a temporary network failure. */
      }
    }
    const timer = setInterval(() => void refresh(), 3000)
    return () => {
      current = false
      clearInterval(timer)
    }
  }, [approvalId, emailDraft, state, load])

  async function decide(decision: ApprovalDecision) {
    if (pending) return
    setPending(decision)
    try {
      const { decideApproval, getApproval } = await load()
      const result = await decideApproval(approvalId, decision)
      if (!result.ok) {
        toast.add({
          type: "error",
          title: "Couldn't record your decision",
          description: result.message,
        })
        setState((await getApproval(approvalId)).state)
        return
      }
      setState(result.state)
      if (!result.woke)
        toast.add({
          type: "info",
          title: "Decision saved",
          description: "The bot didn't respond. Send it a message to continue.",
        })
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't record your decision",
        description: "Something went wrong. Try again.",
      })
    } finally {
      setPending(undefined)
    }
  }

  if (emailDraft)
    return (
      <EmailDraftCard
        draft={emailDraft}
        state={state}
        onAction={async (input) => {
          const result = await (await load()).actOnEmailDraft(approvalId, input)
          if (!result.ok) throw new Error(result.message)
          setState(result.approval.state)
          return { draft: result.approval.emailDraft, woke: result.woke }
        }}
      />
    )

  const label = settled[state]
  const computer = detail.kind === "computer"
  const action = approvalActionLabel(detail.action)
  const previewSrc = computer ? approvalPreviewSrc(detail.preview) : undefined
  // A computer approval names the site; its toolkit is only "computer"
  const context = computer
    ? [action, detail.hostname].filter(Boolean).join(" · ")
    : toolkit === "computer"
      ? undefined
      : toolkit
  const Icon = computer ? MonitorIcon : ShieldCheckIcon
  return (
    <div
      className="max-w-sm space-y-3 rounded-xl bg-muted/40 p-3"
      aria-label="Approval request"
    >
      <div className="flex gap-2">
        <Icon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium break-words">{summary}</p>
          <p className="text-xs text-muted-foreground">
            {context
              ? `Needs your approval · ${context}`
              : "Needs your approval"}
          </p>
        </div>
      </div>
      {previewSrc && <ApprovalPreview src={previewSrc} alt={summary} />}
      {computer && detail.command && (
        <pre
          aria-label="Command to run"
          className="max-h-40 overflow-auto rounded-lg bg-background p-2 font-mono text-xs break-all whitespace-pre-wrap"
        >
          {detail.command}
        </pre>
      )}
      {state === "loading" ? (
        <p role="status" className="text-xs text-muted-foreground">
          Checking this request…
        </p>
      ) : label ? (
        <p role="status" className="text-xs text-muted-foreground">
          {label}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!!pending}
            onClick={() => void decide("approve")}
          >
            {pending === "approve" && <Spinner data-icon="inline-start" />}
            Approve
          </Button>
          {!computer && detail.alwaysAllowed !== false && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!!pending}
              onClick={() => void decide("always")}
            >
              {pending === "always" && <Spinner data-icon="inline-start" />}
              Always allow
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!!pending}
            onClick={() => void decide("deny")}
          >
            {pending === "deny" && <Spinner data-icon="inline-start" />}
            Decline
          </Button>
        </div>
      )}
    </div>
  )
}
