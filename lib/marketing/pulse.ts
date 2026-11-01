import { planLimits } from "@/lib/billing-policy"
import { ROUTINE_LIMITS } from "@/lib/routine-policy"

import type { MarketingPage } from "./seo-pages"

// Krafty Pulse: the project-manager experience at /pulse. It is a Bot template
// (`project-coordinator` in lib/bot-templates.ts) plus this page, not a
// separate product: the Bot reads a Google Sheets tracker through the person's
// own connection, reports in its chat, and every write goes through the usual
// approval gate (docs/autonomy.md). There is no project dashboard yet, so the
// page's project view is labelled as an example of the chat report. Claim
// nothing here that the template's brief and the approval rules don't do.

export const pulseName = "Krafty Pulse"
export const pulsePath = "/pulse"
export const pulseTemplateId = "project-coordinator"

const freeApps = planLimits.free.apps
const freeRoutines = ROUTINE_LIMITS.free

export const pulsePrompt =
  "Read my project tracker in Google Sheets. First tell me which columns hold the task, owner, status, due date and last update, and ask me about any you're unsure of. Then list every task that is overdue, blocked, or hasn't been updated in five days, with its row number and owner. Draft a short, friendly follow-up for each owner and a five-line status summary for this week, here in this chat. Don't change the sheet or send anything."

/** The weekly loop the page and the template both describe, in order. */
export const pulseLoop = [
  {
    title: "Read the tracker",
    body: "It opens the Google Sheet you already use, through your own sign-in, and works out which column is which. It asks when a column is unclear.",
  },
  {
    title: "Spot what's slipping",
    body: "Overdue dates, blocked rows, and tasks nobody has touched in days, each with its row number so you can check it.",
  },
  {
    title: "Draft the follow-ups",
    body: "A short nudge for each owner and a status summary you can send, written in the chat for you to edit.",
  },
  {
    title: "You approve",
    body: "Changing a cell or sending an email waits for you. Read the exact change on the approval card, then decide.",
  },
  {
    title: "Repeat every week",
    body: "When a run looks right, ask it to repeat on a schedule, such as every Monday at 9. Each run reads the sheet fresh.",
  },
] as const

export const pulsePage: MarketingPage = {
  path: pulsePath,
  title: "AI project coordinator for Google Sheets and Gmail",
  description:
    "Krafty Pulse reads your Google Sheets project tracker, flags overdue and stale tasks, and drafts follow-ups and status reports for you to approve.",
  summary:
    "For project managers: a Bot that reads your Google Sheets tracker, finds what's slipping, and drafts follow-ups to approve.",
  h1: `${pulseName} for project managers`,
  lead: `${pulseName} is a Krafty Bot set up as a project coordinator. It reads the Google Sheets tracker you already keep, finds overdue, blocked and stale tasks, and drafts the follow-ups and the weekly status report in chat. Your team keeps working in the sheet. Changing a cell or emailing someone waits for your approval.`,
  sections: [
    {
      id: "fit",
      title: "Keep the sheet, lose the chasing",
      body: "Pulse is for coordinators and project managers who run several projects from Google Sheets and Gmail and spend their week collecting updates. It doesn't replace your tracker or ask anyone to learn a new tool. The sheet stays the source of truth, and each run reads it fresh, so the report reflects the latest edits.",
    },
    {
      id: "loop",
      title: "Your weekly project loop",
      body: "One Bot does the routine part of the week, in this order, and comes back to you with the results in its chat.",
      bullets: pulseLoop.map((step) => `${step.title}: ${step.body}`),
    },
    {
      id: "starter-prompt",
      title: "The first brief it starts with",
      body: pulsePrompt,
    },
    {
      id: "approvals",
      title: "What waits for you",
      body: "Reading the sheet and drafting in chat change nothing. Writes go through Krafty's approval gate.",
      bullets: [
        "Changing a cell, adding a row, or updating a status waits for your approval, unless you choose Always allow for that action on that Bot.",
        "Clearing or deleting cells, sharing the sheet, and sending email to anyone else wait for approval every time and can't be always allowed.",
        "A report the Bot emails to an address verified on your own Krafty account arrives without an approval card.",
      ],
      links: [
        { label: "How app approvals work", href: "/ai-agent-human-approval" },
      ],
    },
    {
      id: "plans",
      title: "Start with one sheet for free",
      body: `The free plan includes ${freeApps} connected app and ${freeRoutines} routine, which is enough to connect Google Sheets and get a weekly report in chat. Sending the follow-ups from Gmail, or adding Google Calendar or Slack, means connecting more apps, which needs Pro.`,
      links: [{ label: "Plans and limits", href: "/#pricing" }],
    },
    {
      id: "limits",
      title: "Check before you rely on it",
      body: "Pulse reports in the Bot's chat; there's no separate project dashboard yet, and the project view on this page is an example of that report. Column guesses and judgments about what's at risk can be wrong, so check the rows it cites. After an approved change, open the sheet and confirm it landed once. A run can stop at its usage or step limit before it reads every row.",
    },
  ],
  faqs: [
    [
      "Do I have to move my projects out of Google Sheets?",
      "No. Pulse works on the tracker you already have, through your own Google sign-in. Your team keeps editing the sheet as usual, and each run reads the latest version.",
    ],
    [
      "Will it change my sheet without asking?",
      "No. Every change to the sheet waits for your approval unless you choose Always allow for that action on that Bot. Clearing or deleting cells always needs approval.",
    ],
    [
      "Will it email my team or clients without asking?",
      "No. Sending email to anyone else needs your approval every time and can't be set to always allow. Follow-ups drafted in the chat aren't sent anywhere.",
    ],
    [
      "Can I try it on the free plan?",
      `Yes. The free plan includes one Bot, ${freeApps} connected app and ${freeRoutines} routine, so you can connect Google Sheets and get the report and drafts in chat. Sending from Gmail as well needs Pro, which allows more connected apps.`,
    ],
    [
      "Can it check the tracker every week on its own?",
      "Yes. After a run you like, ask it to repeat on a schedule. Each scheduled run uses your plan allowance, and when the AI allowance runs out, routines stop until it renews or you upgrade.",
    ],
    [
      "Is there a Pulse dashboard?",
      "Not yet. The report arrives in the Bot's chat, and you see its approvals and routines on the Activity page. The project view on this page shows what a report can look like, with sample data.",
    ],
  ],
  related: [
    {
      label: "AI email assistant for Gmail",
      href: "/use-cases/email-assistant",
      description: "Summaries and reply drafts for the threads you pick.",
    },
    {
      label: "AI agents that ask before acting",
      href: "/ai-agent-human-approval",
      description:
        "Which actions wait for approval, and which never can skip it.",
    },
    {
      label: "How Krafty works",
      href: "/how-it-works",
      description:
        "Connected apps, memory, routines, approvals, and usage limits.",
    },
  ],
}

/** The template a "Create" link on /pulse makes (lib/bot-templates.ts). */
export const pulseTemplate = {
  name: "Pulse",
  job: "Project coordinator",
  summary: pulsePage.summary,
  steps: [
    "Reads the project tracker in Google Sheets and confirms which column is which, asking about any it's unsure of",
    "Lists tasks that are overdue, blocked, or haven't been updated in five days, with row numbers and owners",
    "Drafts a short follow-up for each owner and a weekly status summary in chat",
  ],
  waitsForYou: [
    "Changing the sheet waits for approval unless an eligible rule allows it",
    "Sending email to anyone else always waits for your approval",
  ],
  apps: ["Google Sheets", "Gmail"],
  schedule: "On request, then weekly as a routine once a run works",
  prompt: pulsePrompt,
}
