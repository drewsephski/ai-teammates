import type { CSSProperties } from "react"
import {
  CheckIcon,
  MessageSquareTextIcon,
  MonitorIcon,
  PlugIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "lucide-react"

import { howItWorks } from "@/lib/marketing/content"
import styles from "./how-it-works-steps.module.css"
import { StepsInView } from "./steps-in-view"

// Example requests, each something a Bot can do today: email and calendar
// through connected apps, web research, routines, Slack, Docs and GitHub.
const promptRows = [
  [
    "Draft replies to my unread emails",
    "Research these 10 companies",
    "Every Monday, update the pipeline sheet",
  ],
  [
    "Find a time for a call with Sam",
    "Summarize my Slack mentions",
    "Turn this doc into a launch checklist",
    "Tidy up our open GitHub issues",
  ],
] as const

// Connectors a Bot can sign in to, with logos from svgl.app.
const apps = [
  "gmail",
  "slack",
  "google-calendar",
  "notion",
  "github",
  "linear",
  "google-drive",
  "google-sheets",
  "outlook",
  "asana",
  "dropbox",
  "salesforce",
  "discord",
  "todoist",
  "zoom",
  "stripe",
] as const

function Cursor({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 16 20" aria-hidden="true">
      <path
        d="M1 1v15.5l4.2-4 2.9 6.4 2.6-1.2-2.9-6.3H13z"
        fill="#fff"
        stroke="#0a0a0a"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PromptStage() {
  return (
    <div className={`${styles.stage} ${styles.prompts}`}>
      {promptRows.map((row, rowIndex) => (
        <div key={rowIndex} className={styles.promptRow}>
          <div className={styles.promptTrack}>
            {[...row, ...row].map((prompt, index) => (
              <span key={index} className={styles.prompt}>
                “{prompt}”
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function AppStage() {
  return (
    <div className={`${styles.stage} ${styles.apps}`}>
      {apps.map((app, index) => (
        <span
          key={app}
          className={styles.app}
          style={{ "--i": index } as CSSProperties}
        >
          <span
            style={{ backgroundImage: `url(/landing/bot/apps/${app}.svg)` }}
          />
        </span>
      ))}
    </div>
  )
}

function ComputerStage() {
  return (
    <div className={`${styles.stage} ${styles.computer}`}>
      <span className={styles.working}>
        <i />
        Working
      </span>
      <div className={styles.window}>
        <div className={styles.chrome}>
          <i />
          <i />
          <i />
        </div>
        <div className={styles.search}>
          <SearchIcon size={9} />
          <span className={styles.query} />
        </div>
        <div className={styles.results}>
          <span />
          <span className={styles.picked} />
          <span />
        </div>
        <Cursor className={styles.computerCursor} />
      </div>
    </div>
  )
}

function ApprovalStage() {
  return (
    <div className={`${styles.stage} ${styles.approval}`}>
      <div className={styles.email}>
        <p className={styles.emailFrom}>Inbox Manager wants to send</p>
        <p className={styles.emailSubject}>Re: Thursday’s numbers</p>
        <span className={styles.emailLine} />
        <span className={`${styles.emailLine} ${styles.short}`} />
        <div className={styles.emailActions}>
          <span className={styles.discard}>Discard</span>
          <span className={styles.approve}>
            <span className={styles.approveLabel}>Approve</span>
            <span className={styles.sentLabel}>
              <CheckIcon size={11} strokeWidth={2.5} /> Sent
            </span>
          </span>
        </div>
        <Cursor className={styles.approvalCursor} />
      </div>
    </div>
  )
}

const steps = [
  { Icon: MessageSquareTextIcon, Stage: PromptStage },
  { Icon: PlugIcon, Stage: AppStage },
  { Icon: MonitorIcon, Stage: ComputerStage },
  { Icon: ShieldCheckIcon, Stage: ApprovalStage },
] as const

export function HowItWorksSteps() {
  return (
    <StepsInView className={styles.steps}>
      {howItWorks.map((step, index) => {
        const { Icon, Stage } = steps[index]
        return (
          <li key={step.title} className={styles.step}>
            <span className={styles.icon} aria-hidden="true">
              <Icon size={22} strokeWidth={1.5} />
            </span>
            <h3>{step.title}</h3>
            <p>{step.summary}</p>
            <div className={styles.stageSlot} aria-hidden="true">
              <Stage />
            </div>
          </li>
        )
      })}
    </StepsInView>
  )
}
