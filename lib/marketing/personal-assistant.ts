import { planLimits } from "@/lib/billing-policy"
import { ROUTINE_LIMITS } from "@/lib/routine-policy"

import type { MarketingPage } from "./seo-pages"

const freeMinutes = planLimits.free.sandbox / 60

// Hub for the "AI personal assistant" search. Every claim follows from the
// chief-of-staff and email-assistant workflows and docs/autonomy.md.
export const aiPersonalAssistantPage: MarketingPage = {
  path: "/ai-personal-assistant",
  title: "AI personal assistant that works in your apps",
  description:
    "An AI personal assistant that reads your inbox and calendar, drafts replies, runs errands in a browser, and asks before it sends anything. Start free.",
  summary:
    "What an AI personal assistant can do today, the jobs to start with, and what still waits for you.",
  h1: "AI personal assistant",
  lead: "An AI personal assistant on Krafty is a Bot you give your recurring errands to. It reads your email and calendar through accounts you connect, drafts replies, researches on the web, and uses a browser on its own cloud computer. Anything it would send, post, or change waits for your OK unless you chose to always allow that action.",
  sections: [
    {
      id: "what-it-does",
      title: "What can an AI personal assistant do for you?",
      body: "It handles the small jobs that fill a day and have a clear finish line. You describe each job once in plain language, and you can ask the Bot to repeat it on a schedule.",
      bullets: [
        "Prepare a morning brief from unread email, direct messages, and today's meetings.",
        "Sort a bounded set of Gmail threads by what needs a reply, and propose drafts.",
        "Research a person, company, or purchase on the web and come back with sources.",
        "Fill in a web form, check a portal, or download a statement in the browser on its cloud computer.",
        "Keep a running list in Google Sheets or Notion, such as receipts, follow-ups, or applications.",
        "Remind you about a thread you promised to answer and haven't.",
      ],
    },
    {
      id: "first-jobs",
      title: "Which jobs to hand off first",
      body: "Start with one job you can check in a minute. When it goes well twice, turn it into a routine.",
      cards: [
        {
          title: "Morning inbox and calendar brief",
          body: "Every weekday, read unread Gmail, Slack DMs, and today's Google Calendar, then send one message with meeting prep and the replies due today.",
          href: "/use-cases/chief-of-staff",
        },
        {
          title: "Email triage and reply drafts",
          body: "Review ten unread threads, group them by reply needed, waiting, or information only, and draft the three most urgent replies in chat.",
          href: "/use-cases/email-assistant",
        },
        {
          title: "Receipts and expenses",
          body: "Pull the week's receipts from Gmail, file the PDFs in Drive, and add each one to a sheet every Friday.",
          href: "/use-cases/expense-manager",
        },
      ],
    },
    {
      id: "vs-chat",
      title: "How is this different from asking a chatbot?",
      body: "A chatbot answers while the window is open. A personal assistant Bot signs in to the apps you connect, does the steps, keeps working after you close the browser, and tells you when it is done or stuck. It keeps notes you ask it to save in its own memory, so you don't repeat your preferences every time.",
      links: [{ label: "AI agent vs chatbot", href: "/ai-agent-vs-chatbot" }],
    },
    {
      id: "control",
      title: "What waits for you",
      body: "Reading your apps needs no approval. Saving a draft, updating a record, or adding a calendar event waits for you unless you chose to always allow that action for that Bot. Sending and posting ask every time, and high-risk actions can never be set to always allow. On the cloud computer, a separate model checks each click and keypress against a screenshot before it runs. Nothing in an email or web page can approve an action for you.",
      links: [
        {
          label: "How approvals work, in detail",
          href: "/ai-agent-human-approval",
        },
      ],
    },
    {
      id: "setup",
      title: "How to set one up in five minutes",
      bullets: [
        "Create a Bot and tell it it's your personal assistant. It asks a few questions and saves its working instructions.",
        "Give it the first job in plain language, with a small scope, such as ten threads or today's calendar.",
        "Connect Gmail, Google Calendar, or Slack when it asks. You sign in yourself and can disconnect at any time.",
        "Check the result, tell it what to change, and ask it to save the preferences worth remembering.",
        "Ask it to run the job every weekday. It saves a routine that runs in your timezone.",
      ],
    },
    {
      id: "limits",
      title: "Limits to know before relying on it",
      body: "Summaries and judgments about what's urgent can be wrong, so read the original before you commit to anything. A Bot only uses the accounts you connect. A task can stop early at your usage allowance or step limit. Memory holds what you ask the Bot to save, not every past chat. It is a chat workspace on the web and a mobile app, not a Gmail sidebar or a voice assistant.",
    },
    {
      id: "cost",
      title: "What does it cost?",
      body: `The free plan includes one Bot, one connected app, a one-time $${planLimits.free.ai / 1_000_000} AI allowance, ${ROUTINE_LIMITS.free} routine, and ${freeMinutes} minutes of computer time, once. Pro is $20 a month for up to ${planLimits.paid.bots} Bots, unlimited connected apps, a $${planLimits.paid.ai / 1_000_000} AI allowance, up to ${ROUTINE_LIMITS.paid} routines, and ${planLimits.paid.sandbox / 3600} hours of cloud computer time each billing period. If you sign in with a ChatGPT plan, model calls can run on that plan instead of the allowance.`,
    },
  ],
  useCasesTitle: "More jobs for a personal assistant",
  useCases: [
    {
      title: "Outbound research",
      body: "Research a list of companies overnight and leave short draft notes for you to review.",
      href: "/use-cases/sales-outbound",
    },
    {
      title: "Recruiting",
      body: "Find candidates who match a brief and draft a specific note for each one.",
      href: "/use-cases/talent-scout",
    },
  ],
  faqs: [
    [
      "Can an AI personal assistant send email for me?",
      "It can draft replies and, with your approval, send them. On Krafty, sending an email from your connected Gmail asks you every time and can't be set to always allow. The one exception is a plain email to an address you verified on your Krafty account, such as a routine's report to yourself.",
    ],
    [
      "Does it manage my calendar?",
      "It reads your calendar to prepare briefs and spot conflicts. Adding or changing an event is a write to a connected app, so it waits for your approval unless you chose to always allow that action for that Bot.",
    ],
    [
      "Will it remember my preferences?",
      "Yes, when you ask it to. Bots save notes to a memory that is separate from chat history and use them in every later chat. You can see and edit what's saved.",
    ],
    [
      "Does it work on my phone?",
      "You can use Krafty in any browser. The mobile app shows your chats and approvals, and a Bot that needs a decision can reach you there.",
    ],
    [
      "Is an AI personal assistant free?",
      `Krafty's free plan lets you try one Bot with one connected app and a one-time AI allowance. Pro is $20 a month when you want more Bots, apps, routines, and computer time.`,
    ],
  ],
  related: [
    {
      label: "AI email assistant for Gmail",
      href: "/use-cases/email-assistant",
      description: "A bounded Gmail triage and drafts workflow to try first.",
    },
    {
      label: "AI executive assistant",
      href: "/use-cases/chief-of-staff",
      description: "A weekday brief from your inbox, DMs, and calendar.",
    },
    {
      label: "AI agents for small business",
      href: "/ai-agents-for-business",
      description: "Which jobs to hand off first, and how to stay in control.",
    },
  ],
}
