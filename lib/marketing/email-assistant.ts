import type { MarketingPage } from "./seo-pages"

export const emailAssistantPage: MarketingPage = {
  path: "/use-cases/email-assistant",
  title: "AI email assistant for Gmail: triage and drafts",
  description:
    "Use an AI email assistant to summarize Gmail threads, prioritize replies, and prepare drafts. Review the work in chat and approve before an email is sent.",
  summary:
    "A bounded Gmail workflow: summarize threads, prioritize replies, and review drafts before sending.",
  h1: "AI email assistant for Gmail",
  lead: "Krafty's AI email assistant reads the Gmail threads you ask it to review, summarizes what needs attention, and prepares reply drafts. You work with it in chat through your connected Gmail account. Sending an email needs your approval every time.",
  sections: [
    {
      id: "first-run",
      title: "Start with ten threads",
      body: "Create a Bot, connect your Gmail account when prompted, and give it a small review window. Start with summaries and drafts in chat so you can check the results before changing your inbox.",
      bullets: [
        "Ask it to review up to ten unread threads from the last two days.",
        "Have it group threads in its chat summary by reply needed, waiting on someone else, and information only, with the reason for each choice.",
        "Ask for a proposed reply to the three most urgent threads, with missing facts called out.",
        "Check recipients, facts, tone, and attachments before asking it to save or send a reply.",
      ],
    },
    {
      id: "starter-prompt",
      title: "A starter prompt you can use",
      body: "Read up to ten unread Gmail threads from the last two days. Summarize each in one sentence and group them in this chat by reply needed, waiting, or information only. Draft replies here for the three most urgent threads. Include the subject and sender so I can find the originals. Flag missing facts instead of guessing. Do not label, archive, delete, save drafts, or send anything.",
    },
    {
      id: "review",
      title: "From a chat draft to a sent reply",
      body: "A proposed reply in chat has not changed Gmail. If you ask the Bot to save a Gmail draft, that write waits for approval unless an eligible rule already allows it. Sending is a separate action and always needs approval; it cannot be set to always allow. Check the recipient and message on the approval request before deciding.",
      links: [
        { label: "How app approvals work", href: "/ai-agent-human-approval" },
      ],
    },
    {
      id: "results",
      title: "Check what finished",
      body: "Ask for a final summary listing the threads reviewed, drafts prepared, actions completed, and anything still waiting. A proposed draft or pending approval does not mean an email was sent. Check the tool result and your Gmail Sent folder when confirming a send. This walkthrough describes a workflow to try, not a recorded customer run.",
    },
    {
      id: "fit",
      title: "When a chat-based email assistant fits",
      body: "Krafty fits a defined inbox job you want to hand off and inspect, especially when it later needs context from other connected apps. It is a separate chat workspace, not a Gmail sidebar or an inline autocomplete extension. For a calendar and Slack morning brief, use the executive-assistant workflow instead of expanding this first test.",
      links: [
        {
          label: "AI executive assistant workflow",
          href: "/use-cases/chief-of-staff",
        },
      ],
    },
    {
      id: "limits",
      title: "Limits to check before relying on it",
      body: "Summaries and urgency judgments can be wrong. Read the original thread for commitments, deadlines, and sensitive details. The Bot can only use the account and tools you connect, and a run can stop at its usage or step limit. Ask for a scheduled routine after a manual run works; a schedule does not remove approval requirements or guarantee continuous inbox monitoring.",
    },
  ],
  faqs: [
    [
      "Can I try Gmail on the free plan?",
      "Yes. The free plan includes one Bot and one connected app, so you can start with Gmail alone within the included usage allowance. Adding Slack or Google Calendar requires more connected apps on Pro.",
    ],
    [
      "Will it send email without asking?",
      "No. Sending through the Gmail connection requires approval every time and cannot be always allowed. Drafting text in chat does not send it or create a Gmail draft.",
    ],
    [
      "Does grouping threads change my Gmail labels?",
      "No. The starter prompt groups threads only in the chat summary. Applying labels, archiving, or otherwise changing Gmail is a separate write and waits for approval unless an eligible rule allows it.",
    ],
    [
      "Can it prepare a daily inbox summary?",
      "You can ask it to save a scheduled routine after checking a manual run. Ask for the summary in the Bot's chat to avoid a separate email or Slack send. Each run uses your plan allowance and can stop before reviewing every thread.",
    ],
  ],
  related: [
    {
      label: "AI agents for business",
      href: "/ai-agents-for-business",
      description:
        "Choose a first job and evaluate the access, cost, and review it needs.",
    },
    {
      label: "AI executive assistant",
      href: "/use-cases/chief-of-staff",
      description:
        "Combine inbox review with meeting preparation and calendar context.",
    },
    {
      label: "How Krafty works",
      href: "/how-it-works",
      description:
        "Connected apps, memory, routines, approvals, and usage limits.",
    },
  ],
}
