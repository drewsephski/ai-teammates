"use client"

import { useState } from "react"
import { CheckIcon, RotateCcwIcon, ShieldCheckIcon, XIcon } from "lucide-react"

import styles from "./approval-playground.module.css"

type Choice = "approve" | "always" | "deny"

// Each outcome restates a line of `safeguards` in lib/marketing/content.ts.
const outcomes: Record<Choice, { title: string; body: string }> = {
  approve: {
    title: "Done",
    body: "The exact change you saw ran right away. Nothing else was added.",
  },
  always: {
    title: "Done, and remembered",
    body: "Next time this Bot can make this change in this Google account without asking. High-risk actions, such as sending email or deleting, can never be set to always allow.",
  },
  deny: {
    title: "Nothing changed",
    body: "The Bot hears your answer in the chat and picks up from there.",
  },
}

/** A pretend approval request the visitor can answer. Nothing leaves the page. */
export function ApprovalPlayground() {
  const [choice, setChoice] = useState<Choice | null>(null)
  const outcome = choice ? outcomes[choice] : null

  return (
    <div className={styles.playground} data-choice={choice ?? undefined}>
      <div className={styles.card}>
        <div className={styles.head}>
          <span className={styles.badge}>
            <ShieldCheckIcon size={13} strokeWidth={2} />
            Approval needed
          </span>
          <span
            className={styles.app}
            style={{
              backgroundImage: "url(/landing/bot/apps/google-sheets.svg)",
            }}
            aria-hidden="true"
          />
        </div>
        <p className={styles.title}>Add 3 rows to the “Launch tracker” sheet</p>
        <div className={styles.preview} aria-hidden="true">
          <span />
          <span />
          <span className={styles.short} />
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.deny}
            disabled={choice !== null}
            onClick={() => setChoice("deny")}
          >
            Deny
          </button>
          <button
            type="button"
            className={styles.always}
            disabled={choice !== null}
            onClick={() => setChoice("always")}
          >
            Always allow
          </button>
          <button
            type="button"
            className={styles.approve}
            disabled={choice !== null}
            onClick={() => setChoice("approve")}
          >
            Approve
          </button>
        </div>
        <div className={styles.result} role="status" aria-live="polite">
          {outcome && (
            <div className={styles.outcome} key={choice}>
              <span className={styles.outcomeIcon} aria-hidden="true">
                {choice === "deny" ? (
                  <XIcon size={14} strokeWidth={2.5} />
                ) : (
                  <CheckIcon size={14} strokeWidth={2.5} />
                )}
              </span>
              <div>
                <p className={styles.outcomeTitle}>{outcome.title}</p>
                <p className={styles.outcomeBody}>{outcome.body}</p>
              </div>
              <button
                type="button"
                className={styles.reset}
                onClick={() => setChoice(null)}
                aria-label="Reset the demo"
              >
                <RotateCcwIcon size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
