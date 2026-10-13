"use client"

import Link from "next/link"
import { useState, type CSSProperties } from "react"
import {
  ArrowUp,
  Check,
  ChevronLeft,
  Clock3,
  Mail,
  Monitor,
  Plus,
  Hash,
} from "lucide-react"
import { BotMark } from "./bot-mark"
import styles from "./role-showcase.module.css"

type ExampleCard = {
  kind: "email" | "slack" | "computer"
  subject: string
  to?: string
  body: string
}

type BotRole = {
  name: string
  color: string
  lead: string
  description: string
  prompt?: string
  routine?: string
  response: string
  detail: string
  card?: ExampleCard
  approval: string
  conclusion: string
}

const roles: BotRole[] = [
  {
    name: "Sales Outbound",
    color: "#54b9a6",
    lead: "Generate pipeline overnight.",
    description:
      "Researches accounts, scores contacts with intent, drafts email and LinkedIn in your voice, and leaves a review list for you to approve.",
    prompt:
      "work the pipeline overnight: research the accounts, score the contacts, draft email and linkedin in my voice. nothing goes out without me.",
    routine: "Overnight outbound batch",
    response:
      "overnight batch ready: 36 queued in your voice, 4 skipped as recently touched. nothing sent.",
    detail:
      "scoring leans on hiring signals and docs traffic; the top 10 cleared both. northwind is first: three infra roles posted this month and their VP replied to your march thread.",
    card: {
      kind: "email",
      to: "dana@northwind.io",
      subject: "Three infra roles and a migration",
      body: "Hi Dana,\n\nSaw Northwind opened three infra roles this month. Usually that means the migration you mentioned in March is finally moving.\n\nWe cut the same work in half for two teams your size. Worth fifteen minutes next week?\n\nSam",
    },
    approval: "send the top 10 emails, they look good",
    conclusion: "top 10 sending. rest stay queued.",
  },
  {
    name: "Talent Scout",
    color: "#885cf5",
    lead: "Keep your hiring pipeline moving.",
    description:
      "Sources candidates, checks your applicant tracking system, drafts personal outreach, and helps coordinate the next conversation.",
    prompt:
      "keep the sf infra role moving while i'm out. source, draft outreach in my voice, skip anyone already in the ats.",
    routine: "Nightly sourcing pass",
    response:
      "5 profiles ready, notes in your voice. two look strong for the sf role.",
    detail:
      "the two are both infra at series-c shops and neither is in the ats. the other three are worth a read but junior for the band.",
    card: {
      kind: "email",
      to: "jordan.ok@hey.com",
      subject: "Infra work in SF",
      body: "Hi Jordan,\n\nYou spent three years on the storage layer at Basalt, which is roughly the problem we're staring at now: same scale, fewer people.\n\nHappy to walk you through what we're building. Any interest in a call this week?\n\nSam",
    },
    approval: "outreach the first two",
    conclusion: "queued. i'll handle scheduling when they reply.",
  },
  {
    name: "Paid Media",
    color: "#eb4699",
    lead: "Make your budget work harder.",
    description:
      "Pulls live channel and campaign data, sends recommended reallocations against your monthly budget, and holds bids for your approval before making adjustments.",
    prompt:
      "watch the channels every day and tell me when to move budget. never touch spend without me.",
    response:
      "signups 2.4x yesterday. spend is fine. one campaign burning on low ctr. recommendation: pause and shift $2k to the winner.",
    detail:
      "the loser is broad retargeting: $2,140 this week at 0.4% ctr against a 1.6% account average. brand search is converting at three times that and is capped out by noon.",
    card: {
      kind: "slack",
      to: "#growth",
      subject: "Daily channel read",
      body: "Signups are running 2.4× yesterday and month-to-date spend is on plan.\n\nOne change worth making: pause Broad Retargeting (0.4% CTR, $2,140 this week) and move $2k of it to Brand Search, which caps out before noon. Holding until Sam approves.",
    },
    approval: "do it",
    conclusion: "paused and shifted. i'll watch the rest today.",
  },
  {
    name: "Expense Manager",
    color: "#5bc67a",
    lead: "Stay on top of money.",
    description:
      "Builds the weekly summary from your expense manager and sheets, logs new receipts from email, and nudges owners on missing categories before weekly review.",
    prompt:
      "own the weekly expense summary: pull ramp and the sheet, file receipts out of my email, chase whatever's missing.",
    routine: "Weekly expense summary",
    response:
      "weekly summary's up from ramp + sheets. 14 receipts filed, 3 missing categories. nudged the owners.",
    detail:
      "one thing to look at: a $312 charge on your card from saturday doesn't match anything on the calendar or in the receipts.",
    card: {
      kind: "slack",
      to: "#ops-expenses",
      subject: "Missing categories this week",
      body: "Three charges are still uncategorized ahead of Thursday's review: Dana ($480, vendor dinner?), Miguel ($1,210, conference), and Vicky ($96).\n\nDrop a category on yours and I'll fold it into the summary.",
    },
    approval: "drop my personal charge",
    conclusion: "dropped. review doc is ready for thursday.",
  },
  {
    name: "Product Performance",
    color: "#ea4045",
    lead: "Know when performance moves.",
    description:
      "Investigates product metrics, pulls traces and screenshots, and helps your team understand what changed and where to look next.",
    prompt: "watch checkout latency and tell me when something moves.",
    response:
      "checkout p95 spiked overnight. logged into datadog on my computer and pulled flamegraphs: 2 hot spots in the payment path. writeup + screenshots in the doc.",
    detail:
      "p95 is 2.1s, up from 780ms at the same hour last week. both hot spots sit in the tax lookup: one retry loop with no backoff, one currency call that stopped hitting cache after friday's deploy.",
    card: {
      kind: "computer",
      subject: "Checkout traces",
      body: "Approve the SSO prompt on Datadog so I can pull the checkout traces.",
    },
    approval: "send to eng in slack",
    conclusion: "posted in #team-eng-perf with the pack.",
  },
  {
    name: "Bug Reproduction",
    color: "#ea4045",
    lead: "Give engineers reports they can trust.",
    description:
      "Catches the thread, clicks the same path in staging, captures the failure, and drops a repro pack (steps, screenshots, network notes).",
    prompt:
      "when a bug report lands in support, try to reproduce it before it goes to eng.",
    response:
      "caught the “pay button spins” thread. repro'd in staging: fails on discounted annual + tax. steps, screenshots, har in the doc.",
    detail:
      "4 of 4 attempts fail with a discount code on an annual plan in a taxed region. monthly is clean, and annual without a code is clean, so it's the two together.",
    card: {
      kind: "computer",
      subject: "Reproduce checkout",
      body: "Approve the staging login so I can run checkout the way the customer did.",
    },
    approval: "send to eng",
    conclusion: "dropped in #eng-checkout. i'll re-run when the pr updates.",
  },
  {
    name: "Account Health",
    color: "#3c82f6",
    lead: "Stay ahead of your next customer call.",
    description:
      "Brings usage, CRM, meeting notes, and team conversations together to surface risks and prepare an account brief.",
    prompt:
      "read usage and signals across my book and tell me what's at risk before the qbr.",
    routine: "Portfolio watch",
    response:
      "acme call in 40 min. brief from granola + crm + slack is ready. three open threads, recommend push pricing.",
    detail:
      "seats are 92% used against the contract and two admins wired up new integrations last week. the pricing conversation has been open since march, so it's the one thread that's actually cold.",
    approval: "looks right",
    conclusion:
      "locked on the invite. i'll draft follow-ups when the call ends.",
  },
  {
    name: "Chief of Staff",
    color: "#ed712e",
    lead: "Your always-on assistant.",
    description:
      "Scans Slack, email, calendar, and meeting notes and surfaces what's new and what maps to your priorities. Helps follow up on dropped threads, coordinate schedules, and update deliverables.",
    routine: "Morning scan",
    response:
      "morning: 3 meetings, 2 flagged emails, meeting at 3:00pm needs prep. reply drafts ready on the two flagged emails.",
    detail: "Account Health shared the acme usage brief",
    card: {
      kind: "email",
      to: "vicky@acme.co",
      subject: "Re: Thursday's numbers",
      body: "Hi Vicky,\n\nThursday works. I'll bring the usage summary. Seats and the integration counts are both in there.\n\nSam",
    },
    approval: "send the easy one, leave legal",
    conclusion:
      "sent one. legal stays. meeting brief for acme is in the thread.",
  },
]

function ExampleToolCard({
  card,
  workspaceHref,
}: {
  card: ExampleCard
  workspaceHref: string
}) {
  const Icon =
    card.kind === "email" ? Mail : card.kind === "slack" ? Hash : Monitor
  return (
    <div className={styles.toolCard}>
      <div className={styles.toolHeader}>
        <Icon size={15} aria-hidden="true" />
        <span>
          {card.kind === "email"
            ? "New email"
            : card.kind === "slack"
              ? "Slack message"
              : "Computer"}
        </span>
        <span className={styles.toolStatus}>
          {card.kind === "email" ? "Ready to send" : "Done"}
        </span>
      </div>
      {card.kind !== "computer" && (
        <dl className={styles.details}>
          <dt>{card.kind === "email" ? "From" : "Workspace"}</dt>
          <dd>{card.kind === "email" ? "sam@krafty.ai" : "Krafty Bot"}</dd>
          <dt>To</dt>
          <dd>{card.to}</dd>
          <dt>{card.kind === "email" ? "Subject" : "Thread"}</dt>
          <dd>{card.subject}</dd>
        </dl>
      )}
      <p className={styles.cardBody}>{card.body}</p>
      {card.kind === "computer" && (
        <div className={styles.computerPreview}>
          <Monitor size={32} aria-hidden="true" />
          <span>{card.subject}</span>
          <span className={styles.previewCaption}>Example computer task</span>
        </div>
      )}
      {card.kind === "email" && (
        <div className={styles.cardActions}>
          <Link href={workspaceHref}>
            Send email <ArrowUp size={12} aria-hidden="true" />
          </Link>
          <Link href={workspaceHref}>Discard</Link>
        </div>
      )}
    </div>
  )
}

function ExampleConversation({
  role,
  workspaceHref,
}: {
  role: BotRole
  workspaceHref: string
}) {
  return (
    <div
      className={styles.conversation}
      aria-label={`${role.name} example conversation`}
    >
      <header className={styles.chatHeader}>
        <ChevronLeft size={18} aria-hidden="true" />
        <BotMark className={styles.headerAvatar} color={role.color} />
        <span>{role.name}</span>
        <Monitor size={16} aria-hidden="true" />
      </header>
      <div className={styles.messages} key={role.name}>
        <p className={styles.exampleLabel}>Example conversation</p>
        <p className={styles.timestamp}>Saturday 1:08 PM</p>
        {role.prompt && <p className={styles.humanMessage}>{role.prompt}</p>}
        {role.routine && (
          <div className={styles.routine}>
            <span>
              <Clock3 size={13} aria-hidden="true" /> Task brief
            </span>
            <strong>{role.routine}</strong>
            <Check size={13} aria-hidden="true" />
          </div>
        )}
        <p className={styles.timestamp}>12:16 PM</p>
        <p className={styles.botMessage}>{role.response}</p>
        <p className={styles.botMessage}>{role.detail}</p>
        {role.card && (
          <ExampleToolCard card={role.card} workspaceHref={workspaceHref} />
        )}
        <p className={styles.humanMessage}>{role.approval}</p>
        <p className={styles.botMessage}>{role.conclusion}</p>
      </div>
      <Link
        href={workspaceHref}
        className={styles.composer}
        aria-label={`Start a conversation with your ${role.name} bot`}
      >
        <Plus size={18} aria-hidden="true" />
        <span>Message your bot</span>
        <span className={styles.sendIcon}>
          <ArrowUp size={16} aria-hidden="true" />
        </span>
      </Link>
    </div>
  )
}

export function RoleShowcase({ workspaceHref }: { workspaceHref: string }) {
  const [selected, setSelected] = useState(0)
  const role = roles[selected]
  return (
    <section
      id="use-cases"
      className={styles.section}
      aria-labelledby="roles-heading"
    >
      <div
        className={styles.layout}
        style={{ "--role-color": role.color } as CSSProperties}
      >
        <div className={styles.copy}>
          <h2 id="roles-heading">Give each Bot a job</h2>
          <div className={styles.pills} aria-label="Choose a bot role">
            {[[0, 1, 2], [3, 4], [5, 6], [7]].map((row, index) => (
              <div className={styles.pillRow} key={index}>
                {row.map((roleIndex) => (
                  <button
                    key={roles[roleIndex].name}
                    type="button"
                    aria-pressed={selected === roleIndex}
                    aria-controls="role-example"
                    onClick={() => setSelected(roleIndex)}
                    className={styles.pill}
                  >
                    <span className={styles.pillAvatar}>
                      <BotMark color={roles[roleIndex].color} />
                    </span>
                    {roles[roleIndex].name}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <p className={styles.description} key={role.name}>
            <strong>{role.lead}</strong> {role.description}
          </p>
          <Link href={workspaceHref} className={styles.explore}>
            Explore more bots
          </Link>
        </div>
        <div id="role-example" className={styles.example}>
          <ExampleConversation role={role} workspaceHref={workspaceHref} />
        </div>
      </div>
    </section>
  )
}
