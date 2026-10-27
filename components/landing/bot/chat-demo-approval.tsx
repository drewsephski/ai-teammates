"use client"

import { useMemo, useRef, useState, type ComponentProps } from "react"
import { ApprovalCard } from "@/components/approval-card"
import { EmailDraftCard } from "@/components/email-draft-card"
import type { EmailDraft } from "@/lib/email-draft"
import type { DemoEntry, DemoAgent } from "./chat-demo-data"
import { DemoResponse } from "./chat-demo-response"
import { DemoActivity } from "./chat-demo-activity"
import type {
  DemoDecisionState,
  DemoConfirmationHandler,
} from "./chat-demo-inbox"
import styles from "./chat-demo.module.css"

const waitForDemoAction = () =>
  new Promise<void>((resolve) => window.setTimeout(resolve, 650))

/** Real product cards with a local-only adapter; never calls a server action. */
function LocalDecision({
  entry,
  name,
  agent,
  onReset,
  decisionId,
  onDecision,
  onConfirmation,
}: {
  entry: DemoEntry
  name: string
  agent?: DemoAgent
  onReset: () => void
  decisionId: string
  onDecision?: (id: string, state: DemoDecisionState) => void
  onConfirmation?: DemoConfirmationHandler
}) {
  const [busy, setBusy] = useState(false)
  const [state, setState] = useState<DemoDecisionState>(
    entry.initialState ?? "pending"
  )
  const [draft, setDraft] = useState<EmailDraft | undefined>(() =>
    entry.email
      ? {
          ...entry.email,
          cc: "",
          bcc: "",
          revision: 0,
          editable: ["to", "cc", "bcc", "subject", "body"],
        }
      : undefined
  )
  const decision = useRef<"pending" | "executed" | "denied">(
    entry.initialState ?? "pending"
  )
  const api = useMemo<ComponentProps<typeof ApprovalCard>["api"]>(() => {
    return {
      getApproval: async () => ({
        state: decision.current,
        summary: entry.text,
        toolkit: entry.approval?.toolkit ?? "",
        expiresAt: new Date(Date.now() + 3600000),
        emailDraft: undefined,
        kind: "app",
        hostname: null,
        action: null,
        alwaysAllowed: entry.approval?.alwaysAllowed ?? true,
        preview: null,
        command: null,
      }),
      decideApproval: async (_id, choice) => {
        setBusy(true)
        onDecision?.(decisionId, "running")
        await waitForDemoAction()
        decision.current = choice === "deny" ? "denied" : "executed"
        setState(decision.current)
        onDecision?.(decisionId, decision.current)
        onConfirmation?.(
          decisionId,
          choice === "deny"
            ? "I’ve left that action undone."
            : (entry.confirmation ??
                `Done — ${entry.text.charAt(0).toLowerCase()}${entry.text.slice(1)}.`),
          name
        )
        setBusy(false)
        return { ok: true, state: decision.current, woke: true, chatId: "demo" }
      },
      actOnEmailDraft: async () => {
        throw new Error("Use the local draft editor")
      },
    }
  }, [entry, decisionId, onDecision, onConfirmation, name])
  return (
    <>
      {draft ? (
        <EmailDraftCard
          draft={draft}
          state={state}
          onAction={async (input) => {
            setBusy(true)
            onDecision?.(decisionId, "running")
            if (input.action === "send") setState("running")
            await waitForDemoAction()
            const next =
              input.action === "discard"
                ? draft
                : { ...draft, ...input.content, revision: draft.revision + 1 }
            setDraft(next)
            if (input.action !== "save")
              setState(input.action === "send" ? "executed" : "denied")
            onDecision?.(
              decisionId,
              input.action === "save"
                ? "pending"
                : input.action === "send"
                  ? "executed"
                  : "denied"
            )
            if (input.action !== "save")
              onConfirmation?.(
                decisionId,
                input.action === "send"
                  ? `Sent to ${next.to}.`
                  : "Discarded the draft. Nothing was sent.",
                name
              )
            setBusy(false)
            return { draft: next, woke: true }
          }}
        />
      ) : (
        <>
          <div
            className={`${styles.message} ${styles.agentMessage} ${styles.approvalContext}`}
          >
            {entry.approval?.details}
          </div>
          <ApprovalCard
            approvalId="local-demo"
            summary={entry.text}
            toolkit={entry.approval?.toolkit}
            api={api}
          />
        </>
      )}
      {busy && <DemoActivity name={name} agent={agent} state="working" />}
      {!onConfirmation && (state === "executed" || state === "denied") && (
        <DemoResponse name={name} agent={agent} confirmation>
          {state === "denied"
            ? draft
              ? "Discarded the draft. Nothing was sent."
              : "I’ve left that action undone."
            : draft
              ? `Sent to ${draft.to}.`
              : (entry.confirmation ??
                `Done — ${entry.text.charAt(0).toLowerCase()}${entry.text.slice(1)}.`)}
        </DemoResponse>
      )}
      <div className={styles.cardFooter}>
        <span className={styles.demoNotice}>
          Interactive example · no external actions
        </span>
        <button
          type="button"
          disabled={busy}
          className={styles.replayDecision}
          onClick={onReset}
        >
          Reset example
        </button>
      </div>
    </>
  )
}

export function DemoApproval({
  entry,
  name = "Krafty",
  agent,
  decisionId = "demo:0",
  onDecision,
  onConfirmation,
}: {
  entry: DemoEntry
  name?: string
  agent?: DemoAgent
  decisionId?: string
  onDecision?: (id: string, state: DemoDecisionState) => void
  onConfirmation?: DemoConfirmationHandler
}) {
  const [attempt, setAttempt] = useState(0)
  return (
    <div className={`dark ${styles.productCard}`}>
      <LocalDecision
        key={attempt}
        entry={entry}
        name={name}
        agent={agent}
        decisionId={decisionId}
        onDecision={onDecision}
        onConfirmation={onConfirmation}
        onReset={() => {
          setAttempt((value) => value + 1)
          onDecision?.(decisionId, entry.initialState ?? "pending")
          onConfirmation?.(decisionId, "", name)
        }}
      />
    </div>
  )
}
