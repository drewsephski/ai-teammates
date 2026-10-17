"use client"

import { useState } from "react"
import { formatDistanceToNowStrict } from "date-fns"

import { humanizeToolSlug } from "@/components/approval-text"
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

export type ApprovalRule = {
  botId: string
  botName: string
  toolSlug: string
  createdAt: Date
}

type Revoke = (input: { botId: string; toolSlug: string }) => Promise<unknown>

// Loaded on demand so tests never pull the server action into the module graph
const revokeViaAction: Revoke = async (input) =>
  (await import("@/actions/approvals")).revokeApprovalRule(input)

function RuleRow({ rule, revoke }: { rule: ApprovalRule; revoke: Revoke }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const action = humanizeToolSlug(rule.toolSlug)

  async function remove() {
    setPending(true)
    try {
      await revoke({ botId: rule.botId, toolSlug: rule.toolSlug })
      setOpen(false)
      toast.add({ type: "success", title: "Rule removed" })
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't remove the rule",
        description: "Something went wrong. Try again.",
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <li className="flex items-center gap-3 rounded-xl bg-muted/60 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{action}</p>
        <p className="truncate text-xs text-muted-foreground">
          {rule.botName} · added{" "}
          {formatDistanceToNowStrict(rule.createdAt, { addSuffix: true })}
        </p>
      </div>
      <AlertDialog
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
      >
        <AlertDialogTrigger
          render={
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Remove always allow for ${action}, ${rule.botName}`}
            />
          }
        >
          Remove
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              {rule.botName} will ask for your approval again before it does
              this: {action}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => void remove()}
            >
              {pending && <Spinner data-icon="inline-start" />}
              Remove rule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}

// The actions a person chose "Always allow" for. Each lets one bot do one kind
// of thing without asking, until removed here.
export function ApprovalRules({
  rules,
  revoke = revokeViaAction,
}: {
  rules: ApprovalRule[]
  revoke?: Revoke
}) {
  if (!rules.length)
    return (
      <p className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
        No actions are always allowed. When you choose Always allow on a
        request, it shows up here, and you can remove it.
      </p>
    )
  return (
    <ul className="flex flex-col gap-2">
      {rules.map((rule) => (
        <RuleRow
          key={`${rule.botId}:${rule.toolSlug}`}
          rule={rule}
          revoke={revoke}
        />
      ))}
    </ul>
  )
}
