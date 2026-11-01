import { APPROVAL_TTL_MS, SELF_EMAILS_PER_TURN } from "@/lib/approval-policy"
import { planLimits } from "@/lib/billing-policy"
import { composerCommands } from "@/lib/composer"
import { LEASE_WAIT_MS } from "@/lib/computer-lease-policy"
import { FREE_RETENTION_DAYS } from "@/lib/computer-retention-policy"
import { FREE_MEMORY_LIMIT, memoryKindLabels } from "@/lib/memory-policy"
import { EVENT_RUNS_PER_DAY, ROUTINE_EVENTS } from "@/lib/routine-events"
import {
  MIN_INTERVAL_HOURS,
  MISSED_RUN_ERROR,
  ROUTINE_LIMITS,
  STOPPED_RUN_ERROR,
  missedRunGraceMs,
} from "@/lib/routine-policy"
import { IDLE_TIMEOUT_MS, SESSION_LIMIT_MS } from "@/lib/sandbox-policy"
import { formatBudget, LOOP_STEP_LIMIT, TASK_BUDGETS } from "@/lib/turn-spend"
import { LOW_USAGE_RATIO } from "@/lib/usage-notice"

import type { MarketingFaq } from "./seo-pages"
import {
  brandName,
  freeComputerMinutes,
  freePlanIncludes,
  productName,
  publicPlans,
  supportEmail,
} from "./site"

// The public help center at /help: one page per topic, written for the people
// who use Krafty rather than for developers (docs/ is for them). The pages,
// their Markdown copies (lib/marketing/markdown.ts), llms.txt and the sitemap
// all read this file. Every sentence must stay true of the code: limits and
// timings are imported from the modules that enforce them, and the approval
// and computer pages say no more than "What is enforced" in docs/autonomy.md.

export type HelpSection = {
  id: string
  title: string
  /** Paragraphs, answer first. */
  body?: readonly string[]
  /** Numbered steps, for something the reader does in order. */
  steps?: readonly string[]
  bullets?: readonly string[]
  links?: readonly { label: string; href: string }[]
}

export type HelpTopic = {
  slug: string
  /** Title tag without the " · Krafty" suffix. Keep it under 52 characters. */
  title: string
  /** Meta description, 110 to 158 characters. */
  description: string
  /** One line for the help index and llms.txt. */
  summary: string
  h1: string
  lead: string
  sections: readonly HelpSection[]
  faqs: readonly MarketingFaq[]
  /** Slugs of other topics worth reading next. */
  related: readonly string[]
}

export const helpPath = "/help"
export const helpTopicPath = (slug: string) => `${helpPath}/${slug}`

const usd = (millionths: number) => millionths / 1_000_000
const paidBots = planLimits.paid.bots
const paidHours = planLimits.paid.sandbox / 3600
const paidAllowance = usd(planLimits.paid.ai)
const freeAllowance = usd(planLimits.free.ai)
const proPrice = publicPlans[1].price

const minutes = (ms: number) => ms / 60_000
const hours = (ms: number) => ms / 3_600_000
const hoursPhrase = (count: number) =>
  count === 1 ? "one hour" : `${count} hours`

// How late a run may still start (lib/routine-policy.ts, missedRunGraceMs)
const onceGrace = hours(
  missedRunGraceMs({ kind: "once", at: "2026-01-01T09:00:00Z" })
)
const dailyGrace = hours(
  missedRunGraceMs({ kind: "daily", time: "09:00", days: [1] })
)
const longIntervalGrace = hours(missedRunGraceMs({ kind: "interval", hours: 24 }))
const hourlyGraceMinutes = minutes(
  missedRunGraceMs({ kind: "interval", hours: MIN_INTERVAL_HOURS })
)
const eventLabels = Object.values(ROUTINE_EVENTS).map((event) => event.label)
const approvalDays = APPROVAL_TTL_MS / (24 * 3_600_000)
const budgets = TASK_BUDGETS.map(formatBudget)
const lowPercent = Math.round(LOW_USAGE_RATIO * 100)
const leaseWait =
  minutes(LEASE_WAIT_MS) === 1
    ? "a minute"
    : `${minutes(LEASE_WAIT_MS)} minutes`

const supportLine = `Email ${supportEmail}. Say what you were trying to do, what happened, and whether you were on the web or the phone app. Never send passwords, sign-in codes, API keys or card numbers.`

export const helpIndex = {
  path: helpPath,
  title: "Help center",
  description: `How to use ${productName}: create Bots, connect apps, use the cloud computer, schedule routines, approve actions, follow your usage, and delete your account.`,
  h1: "Help center",
  lead: `Guides to using ${productName}, from your first Bot to deleting your account. Each one describes what the app does today. If something here doesn't match what you see, tell us at ${supportEmail}.`,
} as const

export const helpTopics: readonly HelpTopic[] = [
  {
    slug: "getting-started",
    title: "Get started with Krafty Bot",
    description: `Create your first ${productName}, answer its setup questions, give it a task, and find your way around the workspace, Activity, Memory and Usage.`,
    summary:
      "Create your first Bot, set it up in chat, and find your way around the app.",
    h1: "Get started",
    lead: `A Bot is an AI teammate with a name, a job and working instructions. You create one, it asks a few setup questions in its chat, and then you hand it tasks. The free plan includes ${freePlanIncludes}.`,
    sections: [
      {
        id: "create",
        title: "Create your first Bot",
        steps: [
          "Sign up, then open Workspace.",
          "Select Create bot. You can also open the Create menu (+) in the sidebar and choose Create new bot.",
          "The new Bot opens its chat and sends the first message. Answer its setup questions; most come with choices you can tap.",
          "When you're done, it saves its name, job and working instructions, and it's ready for work.",
        ],
        body: [
          "To skip setup, pick a role under Start with a preset on the Workspace page. A preset Bot comes with its job and instructions already written. The use case pages on this site also have a Create this Bot link for each role.",
        ],
        links: [{ label: "Use cases", href: "/use-cases" }],
      },
      {
        id: "first-task",
        title: "Give it a task",
        body: [
          "Write what you need in the chat, the way you'd brief a colleague: what to do, where the information is, and what you want back. The Bot works through the steps, asks when something is unclear, and tells you when it's done.",
          "It keeps working after you close the browser. When it needs an app, it shows a card to connect it. When it needs a website you have to sign in to, it asks you to sign in on its computer yourself. Anything that would change something in your connected apps waits for your approval.",
          "To have it repeat the job, ask it to: it saves a routine that runs on a schedule.",
        ],
        links: [
          { label: "Connected apps", href: helpTopicPath("connected-apps") },
          { label: "Routines", href: helpTopicPath("routines") },
          { label: "Approvals", href: helpTopicPath("approvals") },
        ],
      },
      {
        id: "find-your-way",
        title: "Find your way around",
        bullets: [
          "Workspace lists your Bots, your connected apps and your API keys, and has the presets.",
          "Activity shows requests waiting for your approval, the actions you always allow, your routines, and what your Bots did on their own.",
          "The sidebar also lists your conversations, with pinned Bots above them.",
          "Memory shows what your Bots remember about you, and lets you edit or delete it.",
          "Usage shows how much of your AI allowance and computer time is left. Plans & billing is where you upgrade.",
          "The account menu at the bottom of the sidebar has Manage account, the theme switch, Usage, Sign out and Delete account.",
        ],
      },
      {
        id: "edit",
        title: "Change, pin or delete a Bot",
        body: [
          "Right-click a Bot in the sidebar to Pin it, Edit it or Delete it. Pinned Bots stay above your conversation list. You can also open a Bot's settings from the button with its name in the chat header.",
          `Settings cover its appearance (shape and color), its name, its job, its working instructions, and a spend limit per task.`,
        ],
        links: [{ label: "Bots and group chats", href: helpTopicPath("teammates") }],
      },
      {
        id: "phone",
        title: "On your phone",
        body: [
          `The ${brandName} phone app shows the same Bots and chats. It's also where notifications arrive: approvals, questions from your Bots, finished routines, and an optional morning summary. Get the app page has what's available for your device.`,
        ],
        links: [{ label: "Get the app", href: "/download" }],
      },
    ],
    faqs: [
      [
        "Can I have more than one Bot?",
        `The free plan includes ${planLimits.free.bots} Bot. Pro allows up to ${paidBots}.`,
      ],
      [
        "Do I have to finish setup in one go?",
        "No. A Bot that isn't set up yet shows Configure in chat when you right-click it, and picks up where you left off.",
      ],
      [
        "How do I switch between dark and light?",
        "Use the theme switch in the account menu, or press D anywhere outside a text field. Dark is the default.",
      ],
    ],
    related: ["teammates", "memory", "billing-and-usage"],
  },
  {
    slug: "teammates",
    title: "Bots, group chats and handoffs",
    description:
      "How Krafty Bots share memory, apps and one computer, how group chats and handoffs between Bots work, and what deleting a Bot removes.",
    summary:
      "What each Bot has, how group chats and handoffs work, and what deleting a Bot removes.",
    h1: "Bots and group chats",
    lead: "Each Bot has its own job and working instructions and its own chat with you. Your Bots also share a lot: what they remember about you, your connected apps, and one cloud computer.",
    sections: [
      {
        id: "what-is-shared",
        title: "What a Bot has, and what Bots share",
        bullets: [
          "Its own: a name, an appearance, a job, working instructions, a spend limit per task, and its private chat with you.",
          "Shared by all your Bots: your connected apps, your API keys, and your one cloud computer, so files and browser sign-ins carry over from one Bot to the next.",
          "Memory is shared too, except notes a Bot saves about how it does its own job.",
          "Each conversation only shows that conversation's messages. What one Bot learned in another chat reaches it through memory, not through the chat history.",
        ],
        links: [
          { label: "Memory", href: helpTopicPath("memory") },
          { label: "The cloud computer", href: helpTopicPath("computer") },
        ],
      },
      {
        id: "group-chats",
        title: "Group chats",
        steps: [
          "Open the Create menu (+) in the sidebar and choose Create group chat.",
          "Give the group a name and pick two to eight Bots.",
          "Pick who you're talking to with the Bot selector in the message box. Each message goes to one Bot.",
        ],
        body: [
          "Every member sees the whole conversation. When a request belongs to another member, the Bot you asked can hand it to them, and they take over in the same chat. A group chat needs at least two Bots, so it needs a plan with more than one.",
        ],
      },
      {
        id: "handoffs",
        title: "Ask, hand off and tag",
        body: [
          "Type @ in any chat to tag another of your Bots. The Bot you're talking to asks the tagged Bot for its view and brings the answer back, saying who said what. The tagged Bot sees only that question, its own recent chat with you, and your shared memory. Tagging doesn't add it to a group chat.",
          "When you ask a Bot for something outside its job, it can brief one of your other Bots in a fresh chat, create a new specialist Bot, or start a group chat. It explains what it's doing first and then moves you to that chat. New Bots count toward your plan's Bot limit.",
          "Asking another Bot costs AI allowance like the rest of the task.",
        ],
      },
      {
        id: "commands",
        title: "Commands",
        body: [
          "Type / in the message box for shortcuts. Type /help to see them in the app.",
        ],
        bullets: composerCommands
          .filter((command) => command.name !== "help")
          .map(
            (command) =>
              `/${command.name}${command.hint ? ` ${command.hint}` : ""}: ${command.description}.`
          ),
      },
      {
        id: "delete",
        title: "Delete a Bot",
        body: [
          "Right-click the Bot in the sidebar and choose Delete bot. This deletes the Bot and your chat with it, and removes it from group chats. Its routines, its always-allow rules and the notes it saved about its own job go with it. It can't be undone.",
          "The computer stays, with its files and sign-ins, for your other Bots. To keep a conversation, use Export chat as Markdown in the chat header first.",
        ],
      },
    ],
    faqs: [
      [
        "What happens to my extra Bots if I go back to the free plan?",
        "They stay in your account, but only the Bot you created first can work. Upgrading again makes the others available.",
      ],
      [
        "Can two Bots use the computer at the same time?",
        `No. They take turns: a Bot that finds the computer in use waits up to ${leaseWait}, then tells you the computer is busy.`,
      ],
      [
        "Can a Bot see my other chats?",
        "No. A Bot sees the conversation it's in. Facts about you carry across through memory, which you can review on the Memory page.",
      ],
    ],
    related: ["getting-started", "memory", "computer"],
  },
  {
    slug: "memory",
    title: "Memory: what your Bots remember",
    description:
      "What Krafty Bots save to memory, how About you works, how to edit, delete or turn off memory, and what the free plan's memory limit is.",
    summary:
      "What Bots save to memory, how to edit or delete it, and how to turn it off.",
    h1: "Memory",
    lead: "Memory is the set of notes your Bots keep about you, so you don't have to repeat yourself in every chat. It's separate from chat history, and you can read, edit or delete every note on the Memory page.",
    sections: [
      {
        id: "how-it-works",
        title: "How Bots remember",
        body: [
          `A Bot saves a note when you ask it to remember something, and when it learns something that will matter later: your role, your preferences, people you work with, ongoing projects, or how you want it to do its job. Notes are grouped as ${Object.values(
            memoryKindLabels
          ).join(", ")}.`,
          "Bots don't keep everything. If something matters, tell the Bot to remember it. A Bot that says it will remember something without saving a note hasn't saved it.",
          "Memories are shared by every Bot, unless a Bot saved a note only about how it does its own job.",
        ],
      },
      {
        id: "about-you",
        title: "About you",
        body: [
          "At the top of the Memory page, About you holds your role, working hours, how you like answers, your timezone and anything else you want every Bot to know from the start, without asking.",
          "Set your timezone here. Bots use it to read times like \"tomorrow afternoon\", and the morning summary needs it.",
        ],
      },
      {
        id: "manage",
        title: "Edit, delete or turn off memory",
        bullets: [
          "Edit or delete any memory from the list on the Memory page.",
          "When a Bot corrects a memory, the older version is kept as history.",
          "Switch Memory off at the top of the page and your Bots stop reading and saving memories. What's already saved stays until you delete it.",
        ],
      },
      {
        id: "secrets",
        title: "What memory won't hold",
        body: [
          "Memory refuses notes that look like passwords, API keys, tokens or card numbers. To give a Bot an API key, use the private key card instead.",
        ],
        links: [{ label: "API keys", href: `${helpTopicPath("connected-apps")}#api-keys` }],
      },
      {
        id: "limits",
        title: "Limits",
        body: [
          `The free plan keeps ${FREE_MEMORY_LIMIT} memories. When it's full, a Bot tells you it couldn't save, and you can delete some on the Memory page. Pro has no memory limit.`,
        ],
      },
    ],
    faqs: [
      [
        "Does deleting a Bot or a group chat delete what was remembered?",
        "Shared memories stay on the Memory page until you delete them there. Deleting a Bot removes only the notes it saved about how it does its own job.",
      ],
      [
        "Why did a Bot forget something I told it?",
        "It may not have saved a note. Ask it to remember the fact, then check that it appears on the Memory page.",
      ],
    ],
    related: ["teammates", "getting-started", "account-deletion"],
  },
  {
    slug: "connected-apps",
    title: "Connect apps and add API keys",
    description:
      "How to connect apps like Gmail, Slack or Google Sheets to your Krafty Bots, what needs approval, how to disconnect, and how private API key cards work.",
    summary:
      "Connect and disconnect apps, what Bots can do in them, and how to give a Bot an API key.",
    h1: "Connected apps",
    lead: "Bots work in your apps, such as Gmail, Google Sheets, Slack and Notion, through accounts you connect yourself. Reading needs no approval. Anything that would change something in an app waits for you.",
    sections: [
      {
        id: "connect",
        title: "Connect an app",
        body: [
          "The first time a task needs an app, the Bot shows a card in the chat. Select it and sign in on the app's own page; you never give the Bot your password. You can also connect apps ahead of time from Workspace, under Connected apps: choose Connect apps and search the catalog.",
          "Websites without a connection can still be used in the computer's browser, where you sign in yourself when the Bot asks.",
        ],
        links: [{ label: "The cloud computer", href: helpTopicPath("computer") }],
      },
      {
        id: "what-bots-do",
        title: "What Bots do in your apps",
        body: [
          "Bots read freely: searching mail, reading a sheet, listing messages. Anything that writes, such as sending, posting, updating a record or deleting, is held as an approval until you decide. One exception: a plain email a Bot sends only to an address verified on your Krafty account, such as a routine's report, goes out without asking.",
        ],
        links: [{ label: "Approvals", href: helpTopicPath("approvals") }],
      },
      {
        id: "disconnect",
        title: "Disconnect an app",
        steps: [
          "Open Workspace and choose Manage apps under Connected apps.",
          "Find the app on the Connected tab.",
          "Select Disconnect.",
        ],
        body: [
          "Bots lose access right away. Deleting your Krafty account disconnects every app.",
        ],
      },
      {
        id: "limits",
        title: "Plan limits",
        body: [
          `The free plan includes ${planLimits.free.apps} connected app; Pro has no limit. To switch apps on the free plan, disconnect the one you have first. If you go back to the free plan with several apps connected, Bots can use only one of them.`,
        ],
      },
      {
        id: "api-keys",
        title: "API keys",
        body: [
          "Some tasks need an API key for a service without a connection. A Bot asks for one with a private key card in the chat; you can also add keys from Workspace, under API keys.",
          "The key goes straight to Krafty's server and is stored encrypted. It's never a chat message, so the Bot doesn't see it. Its commands on the computer get it as an environment variable, and the key is hidden from what they print. Delete a key from the API keys list at any time.",
        ],
      },
    ],
    faqs: [
      [
        "Can I connect two accounts of the same app?",
        "Yes. The free plan's limit counts apps, not accounts, so two Gmail accounts count as one app.",
      ],
      [
        "Does disconnecting undo what a Bot already did?",
        "No. Actions already taken in an app stay there. Disconnecting stops future access.",
      ],
    ],
    related: ["approvals", "computer", "billing-and-usage"],
  },
  {
    slug: "computer",
    title: "Your Bots' cloud computer",
    description:
      "How the shared Krafty cloud computer works: watching it, signing in to sites, pausing and resetting it, computer time, and when free computers are deleted.",
    summary:
      "The shared cloud computer: watching it, signing in, pausing, resetting, and computer time.",
    h1: "The cloud computer",
    lead: "Your account has one persistent cloud computer with a desktop and a browser, shared by all your Bots. It's created the first time a Bot needs it, and files and browser sign-ins stay on it from one task to the next.",
    sections: [
      {
        id: "watch",
        title: "Watch it work",
        body: [
          "Select Desktop in any chat's header to see the computer live. You can watch a Bot work, open the view full screen, or pause the computer from there.",
          `Your Bots take turns on it. A Bot that finds another Bot working waits up to ${leaseWait}, then says the computer is busy.`,
        ],
      },
      {
        id: "sign-in",
        title: "Sign in to websites",
        body: [
          "When a site needs a sign-in, a verification code or a check that you're a person, the Bot stops and shows a card asking you to finish it in Desktop yourself. Sign in there, then tell the Bot you're done. Never type passwords or codes into the chat.",
          "Bots don't enter payment details. If a purchase needs them, the Bot asks you to complete the payment in Desktop.",
          "Because the browser is shared, a site one Bot signed in to stays signed in for the others.",
        ],
      },
      {
        id: "pause",
        title: "Pausing and computer time",
        body: [
          `The computer pauses after ${minutes(IDLE_TIMEOUT_MS)} minutes without use and resumes when a Bot needs it, with its files and sign-ins intact. A single session runs for at most ${minutes(SESSION_LIMIT_MS)} minutes; then it pauses and picks up again on the next use.`,
          `Computer time counts only while the computer is running. The free plan includes ${freeComputerMinutes} minutes, once. Pro includes ${paidHours} hours each billing period. When your time runs out, the computer pauses until it renews or you upgrade.`,
        ],
        links: [{ label: "Billing and usage", href: helpTopicPath("billing-and-usage") }],
      },
      {
        id: "reset",
        title: "Reset the computer",
        body: [
          "If the computer gets into a bad state, open Desktop and choose Reset computer. This deletes its files and browser sign-ins for all your Bots and can't be undone. Your conversations and memory stay.",
          "Resetting also moves an older computer to the current setup, where the Bots' commands run as a separate user that can't reach the desktop, the browser's sign-ins or the desktop's own services.",
        ],
      },
      {
        id: "free-retention",
        title: "Free computers unused for a while",
        body: [
          `On the free plan, a computer that hasn't been used for ${FREE_RETENTION_DAYS} days is deleted, files included. The next one starts empty. Pro computers aren't deleted this way.`,
        ],
      },
      {
        id: "safety",
        title: "What's checked on the computer",
        body: [
          "Every click, drag, Enter and non-navigation key a Bot sends is checked first by a separate model, using a screenshot the server takes. Steps that would commit something, such as buying, submitting or sending, wait for your approval, and the approval card shows the screen.",
          "That check is a model reading the screen. It reduces risk; it can't remove it.",
        ],
        links: [{ label: "Approvals", href: helpTopicPath("approvals") }],
      },
    ],
    faqs: [
      [
        "Does each Bot get its own computer?",
        "No. One computer per account, shared by all your Bots, so they can pick up each other's files and sign-ins.",
      ],
      [
        "Can I use the computer myself?",
        "Yes, through Desktop. That's how you sign in to sites for your Bots. Time it spends running counts toward your computer time, whoever is using it.",
      ],
    ],
    related: ["approvals", "connected-apps", "billing-and-usage"],
  },
  {
    slug: "routines",
    title: "Routines and missed runs",
    description:
      "Schedule Krafty Bot routines daily, every few hours, once, or when something happens in an app. Pause or delete them, and see what happens to a missed run.",
    summary:
      "Schedule recurring work, manage routines on Activity, and what happens when a run is missed.",
    h1: "Routines",
    lead: "A routine is a task a Bot does on its own, on a schedule or when something happens in a connected app. Each run posts into the routine's chat, the Bot works through it, and you get its report.",
    sections: [
      {
        id: "kinds",
        title: "When a routine can run",
        bullets: [
          "At a set time on the days you pick, such as weekdays at 8:00.",
          `Every few hours, from every hour up to once a week.`,
          "Once, at a date and time.",
          `When something happens in a connected app: when ${eventLabels.join(", when ")}. An app-started routine runs at most ${EVENT_RUNS_PER_DAY} times in 24 hours.`,
        ],
        body: [
          "Times are read in the routine's timezone. Bots use the timezone from About you on the Memory page, so set it before you schedule anything.",
        ],
      },
      {
        id: "create",
        title: "Create a routine",
        body: [
          "The easiest way is to ask the Bot in its chat, for example: \"Every weekday at 8:00, check my inbox for invoices and list them here.\" It saves the routine and tells you when the first run is. One-off routines and routines started by an app are made this way.",
          "You can also open Activity and select New routine under Routines. Pick the Bot, name the routine, write what it should do each time, choose At a set time or Every few hours, and set the timezone.",
          `The free plan includes ${ROUTINE_LIMITS.free} routine. Pro allows up to ${ROUTINE_LIMITS.paid}.`,
        ],
      },
      {
        id: "manage",
        title: "Pause, run or delete a routine",
        body: [
          "Your routines are listed under Routines on the Activity page. From there you can pause and resume one, run it now, delete it, and open its recent runs.",
          "To change what a routine does or when, ask the Bot that owns it in a chat. A Bot can change only its own routines. What starts an app-started routine can't be changed; delete it and ask for a new one.",
          "During a run, a Bot can't create, change or delete routines. Runs read email and web pages written by other people, and this keeps that content from rewriting your schedule.",
        ],
      },
      {
        id: "runs",
        title: "What happens in a run",
        bullets: [
          "The run appears in the routine's chat with the routine's name. The Bot works on its own and finishes with a short report.",
          "If it needs you, it asks a question and you're notified. If it wants to change something in a connected app, that waits for your approval like any other request.",
          "Each run shows a status: Running, Done, Waiting for you, Didn't finish or Skipped.",
          `A run that stops partway, for example when the service fails, is marked Didn't finish with "${STOPPED_RUN_ERROR}" and you're notified.`,
          "Runs use your AI allowance and computer time like any other task, and the Bot's spend limit per task applies. A run that reaches the limit shows as waiting for you.",
        ],
      },
      {
        id: "missed",
        title: "Missed runs are skipped, never replayed",
        body: [
          `If ${brandName} is unavailable when a run is due, the run still starts when the service is back, as long as it isn't too late. A one-off run can start up to ${hoursPhrase(onceGrace)} late, a run at a set time up to ${hoursPhrase(dailyGrace)} late, and a routine that runs every few hours up to ${hoursPhrase(longIntervalGrace)} late (${hourlyGraceMinutes} minutes for one that runs every hour).`,
          `Past that, the run is skipped. Activity shows it as "<routine name> didn't run", with "${MISSED_RUN_ERROR}", and the run's status is Skipped. You aren't sent a notification for it. Missed runs are never replayed later, and several missed runs never pile up into a burst: the schedule moves on to its next time, which is still counted from the original schedule so it doesn't drift.`,
          "If you need the work from a skipped run, select Run now on the Activity page.",
        ],
      },
      {
        id: "skipped",
        title: "Runs skipped before they start",
        body: [
          "A run is also skipped, and you get a notification with the reason, when the Bot isn't available on your current plan or your AI allowance is used up.",
        ],
        links: [{ label: "Billing and usage", href: helpTopicPath("billing-and-usage") }],
      },
      {
        id: "morning-summary",
        title: "Morning summary",
        body: [
          "Turn on Morning summary under Recent on the Activity page to get one phone notification at 8 a.m. in your timezone with what your Bots finished, what didn't finish, and what's waiting for you. It's skipped on days when nothing happened, and it needs your timezone set in About you.",
        ],
      },
    ],
    faqs: [
      [
        "My routine didn't run while Krafty was down. Will it catch up?",
        "No. A run that couldn't start within its window is skipped and shown on Activity, and the routine continues from its next scheduled time. Use Run now if you want that run's work.",
      ],
      [
        "Why does my routine run at the wrong hour?",
        "Check the routine's timezone on Activity and your timezone in About you on the Memory page. A routine keeps its own timezone; ask its Bot to change it.",
      ],
      [
        "Can a routine send email without asking me?",
        `Only a plain email to an address verified on your ${brandName} account, such as its own report, up to ${SELF_EMAILS_PER_TURN} per reply. Anything else it sends waits for your approval.`,
      ],
    ],
    related: ["approvals", "memory", "billing-and-usage"],
  },
  {
    slug: "approvals",
    title: "Approvals and always-allow rules",
    description:
      "What waits for your approval in Krafty, where to approve or decline, how always-allow rules work, how computer steps are checked, and what approvals can't catch.",
    summary:
      "What waits for you, how to approve or decline, always-allow rules, and computer approvals.",
    h1: "Approvals",
    lead: "Bots read your apps freely, but anything that would change something outside Krafty waits for you. Only your own decision approves an action; nothing in a web page, email or document can.",
    sections: [
      {
        id: "what-waits",
        title: "What waits for you",
        bullets: [
          "Writes to your connected apps: sending, posting, sharing, updating a record, deleting, and any action Krafty doesn't recognize.",
          "Steps on the computer that would commit something, such as buying, submitting a form or sending a message.",
          "Commands on the computer that send data out, such as uploading or pushing code. The card shows the exact command, and approving runs it once, as you saw it.",
          `Not held: a plain email a Bot sends only to an address verified on your ${brandName} account, up to ${SELF_EMAILS_PER_TURN} per reply. More than that waits too.`,
        ],
      },
      {
        id: "where",
        title: "Where to approve",
        bullets: [
          "On the card in the chat.",
          "On the Activity page, under Waiting for you. The sidebar shows how many are waiting.",
          "From the notification on your phone, if you use the app, with Approve, Always allow and Decline.",
        ],
        body: [
          "When one reply prepares several actions, such as one email per client, the cards show Approve all and Decline all. You can still decide each one separately.",
        ],
      },
      {
        id: "decide",
        title: "What happens when you decide",
        bullets: [
          "Approve: for an app action, the exact action you saw runs right away, and the Bot is told the result. For a computer step, the Bot looks at the screen again and repeats the step.",
          "Decline: the Bot is told, and it can't ask for another approval in the turn your decline starts. The same app request, unchanged, is refused without a new card for the next 24 hours.",
          `Do nothing: requests expire after ${approvalDays} days. To do it later, ask the Bot again.`,
        ],
      },
      {
        id: "always-allow",
        title: "Always allow",
        body: [
          "Always allow approves this request and lets that Bot take the same action, in the same connected account, without asking again. It covers that Bot, action and account only.",
          "High-risk actions can never be always allowed: sending, posting, sharing, paying, deleting, anything that touches money, grades, rosters or access, and actions Krafty doesn't recognize. Neither can computer steps. On those, Always allow counts as a single approval.",
          "To remove a rule, open Activity and select Remove next to it under Always allowed.",
        ],
      },
      {
        id: "computer",
        title: "Approvals on the computer",
        body: [
          "Every click, drag, Enter and non-navigation key a Bot sends on the computer is checked first by a separate model, using a screenshot the server takes. A step it judges to commit something stops and waits for you. The card shows the screenshot, and the site when the check could read it. The approval covers that step, on that site, for a short time.",
          "Some steps are never approvable: changing passwords, permissions or ownership on an account, and typing commands into a terminal on the desktop. The Bot asks you to do those yourself.",
          "If the check can't run, the step doesn't either.",
        ],
      },
      {
        id: "limits",
        title: "What approvals can't catch",
        bullets: [
          "The computer check is a model reading pixels. It can be wrong, or fooled by a misleading page, and a page can change between the screenshot and the click.",
          "Typing without pressing Enter can still submit on some sites.",
          "The Bots' commands on the computer can still reach the internet. Only commands that obviously send data out wait for approval, so a script can still post data, and a page can try to talk a Bot into that.",
          "A decline on the computer lasts for that turn only. If the Bot asks again later, you'll see a new card, and nothing runs without your approval.",
        ],
      },
    ],
    faqs: [
      [
        "Can a website or an email approve an action for me?",
        "No. Only your decision, from the card, the Activity page or your phone, approves an action.",
      ],
      [
        "I approved an action. Did it go through?",
        "The card shows the outcome: Approved and done, or Approved, but it didn't go through. The Bot is also told the result and reports it in the chat.",
      ],
      [
        "Can I undo an action after approving it?",
        "No. Krafty can't undo something already done in another app. Check the card before you approve.",
      ],
    ],
    related: ["connected-apps", "computer", "routines"],
  },
  {
    slug: "billing-and-usage",
    title: "Plans, billing and usage",
    description: `Krafty Bot's Free and Pro plans, what uses your AI allowance and computer time, spend limits per task, and how to upgrade, change or cancel your plan.`,
    summary:
      "Plans, AI allowance and computer time, spend limits, and how to upgrade or cancel.",
    h1: "Billing and usage",
    lead: `${brandName} has a free plan and Pro, at $${proPrice} a month. Each plan has two allowances: AI usage for model replies and web searches, and computer time. The Usage page shows both.`,
    sections: [
      {
        id: "plans",
        title: "Plans",
        bullets: publicPlans.map(
          (plan) =>
            `${plan.name} (${plan.price === 0 ? "$0" : `$${plan.price} a ${plan.period}`}): ${plan.features
              .map((feature) => feature.charAt(0).toLowerCase() + feature.slice(1))
              .join("; ")}.`
        ),
        body: [
          `Free allowances are one-time and don't renew. Pro allowances renew each billing period, and the Usage page shows when. Prices are in US dollars.`,
        ],
      },
      {
        id: "ai",
        title: "What uses your AI allowance",
        body: [
          "Model replies, web searches, a Bot asking another Bot a question, the safety checks on computer steps, and the suggested follow-ups under a reply. On the web, each reply shows what it used.",
          `When an allowance gets low (under ${lowPercent}% left), the chat tells you how much remains. When your AI allowance is used up, Bots stop and can't start new work until it renews or you upgrade. That includes routines and creating new Bots.`,
        ],
      },
      {
        id: "computer-time",
        title: "Computer time",
        body: [
          `Computer time counts while your cloud computer is running, whichever Bot is using it. The free plan includes ${freeComputerMinutes} minutes, once; Pro includes ${paidHours} hours each billing period. When it runs out, the computer pauses. Computer time isn't part of a reply's cost or the spend limit per task.`,
        ],
        links: [{ label: "The cloud computer", href: helpTopicPath("computer") }],
      },
      {
        id: "spend-limit",
        title: "Spend limit per task",
        body: [
          `In a Bot's settings, Spend limit per task caps how much of your AI allowance one task can use: ${budgets.join(", ")}, or no limit. The Bot stops after the step that reaches it, and you can reply to keep going.`,
        ],
      },
      {
        id: "given-back",
        title: "When usage is given back",
        bullets: [
          "A reply that ends in an error, for example when a model provider fails partway, gets back the AI allowance it used.",
          `A reply that takes the same step with the same result ${LOOP_STEP_LIMIT} times in a row is stopped, and the allowance the repeats used is given back.`,
        ],
      },
      {
        id: "manage-plan",
        title: "Upgrade, change or cancel",
        body: [
          "Open Plans & billing in the sidebar to upgrade, change or cancel your plan. Checkout happens on that page.",
          `If you cancel Pro, you keep it until the end of the period you paid for. Then the free limits apply: only your first Bot works, Bots can use one connected app, and the free allowances are the one-time ones.`,
          "Deleting your account cancels your subscription first.",
          `Bots don't handle billing in chat. For a billing question, email ${supportEmail}.`,
        ],
      },
    ],
    faqs: [
      [
        "Does the free allowance reset each month?",
        `No. The free plan's $${freeAllowance} AI allowance and ${freeComputerMinutes} minutes of computer time are one-time. Pro's $${paidAllowance} and ${paidHours} hours renew each billing period.`,
      ],
      [
        "Why did my Bot stop in the middle of a task?",
        "It reached its spend limit per task, your AI allowance ran out, or it was repeating itself. The chat says which. Reply to keep going once there's allowance left.",
      ],
      [
        "Where do I see what I've used?",
        "Open Usage in the sidebar or the account menu.",
      ],
    ],
    related: ["computer", "routines", "account-deletion"],
  },
  {
    slug: "account-deletion",
    title: "Delete your Krafty account",
    description:
      "How to delete your Krafty account on the web or in the app, what deletion removes and keeps, and what to do if you can't sign in.",
    summary:
      "How to delete your account, what it removes, what's kept, and how to get help.",
    h1: "Delete your account",
    lead: "Deleting your account removes your Bots, conversations, memories, routines and computer, and cancels your subscription. It's permanent and can't be undone.",
    sections: [
      {
        id: "before",
        title: "Before you delete",
        bullets: [
          "Save anything you want to keep. Export chat as Markdown in a chat's header saves a conversation.",
          "To remove less than everything, you can delete a single Bot, a memory, an API key or a routine, or disconnect an app, instead.",
        ],
        links: [
          { label: "Bots and group chats", href: helpTopicPath("teammates") },
          { label: "Memory", href: helpTopicPath("memory") },
        ],
      },
      {
        id: "how",
        title: "How to delete it",
        steps: [
          "On the web, open the account menu at the bottom of the sidebar and choose Delete account. In the phone app, open Account and choose Delete account.",
          "Check that you're signed in to the account you mean to delete.",
          "Confirm. If cancelling your subscription fails, nothing is deleted and you can try again. If a later step fails, ask again and deletion picks up where it stopped.",
        ],
        body: [
          "The delete account page works without the app: sign in there and confirm.",
        ],
        links: [{ label: "Delete account page", href: "/delete-account" }],
      },
      {
        id: "removed",
        title: "What deletion removes",
        bullets: [
          "Your subscription, cancelled before anything else is removed.",
          "Your Bots, chats and group chats, with their conversation history.",
          "Your memories and About you, routines, approvals and always-allow rules, activity, API keys and settings.",
          "Your cloud computer, with its files and browser sign-ins.",
          "Your connected apps, which are disconnected, and Sign in with Apple, which is revoked.",
          "Your account itself. You're signed out on every device.",
        ],
        body: [
          "Deleting your Krafty account doesn't delete your accounts at connected services, or undo anything a Bot already did there.",
        ],
      },
      {
        id: "kept",
        title: "What may be kept",
        body: [
          "Usage and computer-time records stay as the billing record, tied to your former account ID. Payment providers and other services we use may keep their own records under their retention policies. The privacy policy has the details, and you can email us to ask about retained data.",
        ],
        links: [{ label: "Privacy policy", href: "/privacy" }],
      },
      {
        id: "help",
        title: "Can't sign in?",
        body: [
          `Email ${supportEmail} with the subject "Krafty account deletion" and the email address on the account. If you used Sign in with Apple and hid your email, it may be an Apple relay address. We may need to verify that the account is yours. Never send passwords, sign-in codes or card numbers.`,
        ],
      },
    ],
    faqs: [
      [
        "Can I get my account back after deleting it?",
        "No. Deletion is permanent. You can sign up again, but you start with an empty workspace.",
      ],
      [
        "Do I need to cancel my subscription first?",
        "No. Deleting your account cancels it for you.",
      ],
    ],
    related: ["billing-and-usage", "memory", "connected-apps"],
  },
]

/** Contact details shown at the end of every help page. */
export const helpContact = {
  title: "Still stuck?",
  body: supportLine,
} as const

export function findHelpTopic(slug: string) {
  return helpTopics.find((topic) => topic.slug === slug)
}
