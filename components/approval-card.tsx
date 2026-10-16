"use client"

import { useEffect, useState } from "react"
import { ShieldCheckIcon } from "lucide-react"

import { EmailDraftCard } from "@/components/email-draft-card"
import type { EmailDraft } from "@/lib/email-draft"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import type { ApprovalDecision } from "@/db/schema"

// Loaded on demand: chat code that never shows an approval (and its tests)
// shouldn't pull the server action module in
const actions = () => import("@/actions/approvals")

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

// An external action a bot is holding for the owner. The card reads the
// request's current state, so it stays right after a reload or a decision
// made on another device.
export function ApprovalCard({
  approvalId,
  summary,
  toolkit,
}: {
  approvalId: string
  summary: string
  toolkit?: string
}) {
  const [state, setState] = useState<State>("loading")
  const [emailDraft, setEmailDraft] = useState<EmailDraft>()
  const [pending, setPending] = useState<ApprovalDecision>()

  useEffect(() => {
    let current = true
    actions()
      .then(({ getApproval }) => getApproval(approvalId))
      .then(
        (approval) => {
          if (!current) return
          setState(approval.state)
          setEmailDraft(approval.emailDraft)
        },
        () => current && setState("unavailable")
      )
    return () => {
      current = false
    }
  }, [approvalId])

  useEffect(() => {
    if (!emailDraft || !["pending", "approved", "running"].includes(state))
      return
    let current = true
    const refresh = async () => {
      try {
        const approval = await (await actions()).getApproval(approvalId)
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
  }, [approvalId, emailDraft, state])

  async function decide(decision: ApprovalDecision) {
    if (pending) return
    setPending(decision)
    try {
      const { decideApproval, getApproval } = await actions()
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
          const result = await (
            await actions()
          ).actOnEmailDraft(approvalId, input)
          if (!result.ok) throw new Error(result.message)
          setState(result.approval.state)
          return { draft: result.approval.emailDraft, woke: result.woke }
        }}
      />
    )

  const label = settled[state]
  return (
    <div
      className="max-w-sm space-y-3 rounded-xl bg-muted/40 p-3"
      aria-label="Approval request"
    >
      <div className="flex gap-2">
        <ShieldCheckIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium break-words">{summary}</p>
          <p className="text-xs text-muted-foreground">
            {toolkit
              ? `Needs your approval · ${toolkit}`
              : "Needs your approval"}
          </p>
        </div>
      </div>
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
