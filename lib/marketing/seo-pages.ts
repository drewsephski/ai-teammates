import { planLimits } from "@/lib/billing-policy"
import { ROUTINE_LIMITS } from "@/lib/routine-policy"

import { absoluteUrl } from "./content"

/**
 * Shared SEO landing pages. Copy must match real product behavior: check
 * docs/autonomy.md and lib/billing-policy.ts before changing a claim.
 * Statements about other products come from those products' own sites and
 * carry no scores, prices or benchmarks; see `checkedVendors`.
 */
export type MarketingFaq = readonly [question: string, answer: string]

export type MarketingUseCase = {
  title: string
  body: string
  href: string
}

export type MarketingCard = {
  title: string
  body: string
  /** Link for the card title. External links open in a new tab. */
  href?: string
}

export type MarketingSection = {
  id: string
  title: string
  /** Direct answer first, then detail. */
  body?: string
  bullets?: readonly string[]
  cards?: readonly MarketingCard[]
  links?: readonly { label: string; href: string }[]
  /** Small print under the section, such as when vendor facts were checked. */
  note?: string
}

export type MarketingPage = {
  path: string
  /** Title tag without the " · Krafty" suffix the layout adds. Keep it under 55 characters. */
  title: string
  /** Meta description, 120 to 155 characters. */
  description: string
  /** One short line for link lists (llms.txt, related cards). */
  summary: string
  h1: string
  lead: string
  sections: readonly MarketingSection[]
  useCasesTitle?: string
  useCases?: readonly MarketingUseCase[]
  faqs: readonly MarketingFaq[]
  related: readonly { label: string; href: string; description: string }[]
}

const paidBots = planLimits.paid.bots
const paidHours = planLimits.paid.sandbox / 3600
const paidAllowance = planLimits.paid.ai / 1_000_000

/** When the descriptions of other products were last read from their own sites. */
export const checkedVendors = "October 27, 2026"
const vendorNote = `Descriptions of other products come from their own websites, read on ${checkedVendors}. We don't score vendors, quote their prices, or run benchmarks, and their features may have changed since.`

const startFree = `The free plan includes one Bot, one connected app, a one-time $${planLimits.free.ai / 1_000_000} AI allowance, and ${planLimits.free.sandbox / 60} minutes of computer time, once. Pro is $20 a month for up to ${paidBots} Bots, unlimited connected apps, a $${paidAllowance} AI allowance, and ${paidHours} hours of cloud computer time each billing period.`

export const aiAgentsForBusinessPage: MarketingPage = {
  path: "/ai-agents-for-business",
  title: "AI agents for small business: where to start",
  description:
    "What an AI agent can do for a small business, which jobs to hand off first, what it needs from you, how approvals keep you in control, and what it costs.",
  summary:
    "Which jobs to hand to an AI agent first, what it needs from you, and how you stay in control.",
  h1: "AI agents for small business",
  lead: "An AI agent for a small business is software you give a job to, not a question. It signs in to the tools you already use, works through the steps, and comes back with the result or a decision that needs you. This page covers what that looks like in practice, which jobs to start with, and what stays in your hands.",
  sections: [
    {
      id: "what-is",
      title: "What is an AI agent for a small business?",
      body: "It is an assistant that takes actions in your apps instead of describing them. You tell it what you need in plain language. It reads your inbox, your sheets, or your CRM, works out the steps, uses a browser when there is no integration, and reports back. On Krafty Bot each agent is a Bot with a name, a role, its own memory, and a share of one cloud computer that belongs to your account. Connected-app writes wait for approval unless an eligible rule allows them; sending and posting always need approval.",
    },
    {
      id: "jobs",
      title: "Which jobs should a small business hand off first?",
      body: "Start with work that is repetitive, has a clear finish line, and lives in one or two apps. Those jobs are easy to describe, easy to check, and easy to turn into a routine once they go well.",
      cards: [
        {
          title: "Receipts and expenses",
          body: "Pull the week's receipts from Gmail, file the PDFs in Drive, and log each one in a sheet every Friday.",
          href: "/use-cases/expense-manager",
        },
        {
          title: "Inbox and calendar brief",
          body: "Read unread mail, DMs, and today's calendar each morning and leave draft replies waiting in Gmail.",
          href: "/use-cases/chief-of-staff",
        },
        {
          title: "Support triage",
          body: "Read new tickets, draft answers from your help center, and flag real bugs for your tracker.",
          href: "/use-cases/support-triage",
        },
        {
          title: "Ad spend reporting",
          body: "Post yesterday's spend and results to Slack and recommend budget moves without changing a bid.",
          href: "/use-cases/paid-media",
        },
      ],
    },
    {
      id: "needs",
      title: "What does the agent need from you?",
      body: "Three things: a description of the job, access to the apps it touches, and your decisions when it hits something it should not do alone.",
      bullets: [
        "A job description in plain language. On Krafty, a new Bot asks a few setup questions and saves its role and working instructions.",
        "Connected apps. You sign in to each app yourself the first time a task needs it, and you can disconnect it at any time. The Bot never sees your password in chat.",
        "Approvals. Reading your apps needs none. Updating a record or writing a row waits for your OK unless you chose to always allow that action for that Bot. Sending and posting ask every time.",
        "Notes worth remembering. Bots keep the notes you ask them to save, separate from chat history, and use them in every later chat.",
      ],
    },
    {
      id: "control",
      title: "How do you keep control of an agent that acts on its own?",
      body: "By deciding what it may do without you, and by being able to see what it did. On Krafty, every write to a connected app is held for approval by default. High-risk actions can never be set to always allow. On the cloud computer, a separate model checks clicks, drags, Enter, and non-navigation keys against a screenshot before they run, and steps that commit something run only after you approve them. Approval requests expire after seven days, and nothing in a web page or email can approve one for you. The Activity page lists everything a Bot did on its own and anything waiting on you.",
      links: [
        {
          label: "How approvals work, in detail",
          href: "/ai-agent-human-approval",
        },
      ],
    },
    {
      id: "cost",
      title: "What does an AI agent cost a small business?",
      body: `${startFree} The AI allowance covers the model calls your Bots make, and computer time is metered by the second while a Bot is using the cloud computer. If you sign in with a ChatGPT plan, your Bots' model calls can run on that plan instead of the allowance.`,
    },
    {
      id: "choose",
      title: "How to choose an AI agent for your business",
      body: "Whatever tool you look at, the same questions decide whether it will work for a small team.",
      bullets: [
        "Can it use the apps you already have, through your own accounts, and fall back to a browser when there is no integration?",
        "Does work continue on a schedule and after you close the laptop, or only while a chat is open?",
        "What exactly waits for a human before mail is sent, money moves, or a record changes?",
        "Where does it keep context between sessions, and can you see and edit that memory?",
        "How is it priced: by seat, by task, by model usage, by computer time, or some mix, and is there a free plan to try one job first?",
      ],
      links: [
        {
          label: "Compare agents that work on a cloud computer",
          href: "/manus-alternatives",
        },
        { label: "What makes an agent a teammate", href: "/ai-teammates" },
      ],
    },
  ],
  useCasesTitle: "Starter prompts for small teams",
  useCases: [
    {
      title: "Outbound research",
      body: "Research target accounts overnight and leave three-sentence drafts in your inbox, ranked in a sheet.",
      href: "/use-cases/sales-outbound",
    },
    {
      title: "Customer account health",
      body: "Rank accounts renewing soon by churn risk from usage, tickets, and your last email thread.",
      href: "/use-cases/account-health",
    },
    {
      title: "Recruiting",
      body: "Source candidates who match a brief, skip anyone already in your ATS, and draft specific notes.",
      href: "/use-cases/talent-scout",
    },
  ],
  faqs: [
    [
      "Do I need a developer to set up an AI agent on Krafty Bot?",
      "No. You describe the job in chat, connect apps by signing in, and approve writes as they come up. There is no builder to learn and no code to deploy. If a job works, you ask the Bot to repeat it on a schedule and it saves a routine.",
    ],
    [
      "Which apps can a small-business agent use?",
      "Bots find apps in a searchable catalog, including Gmail, Google Sheets, Google Drive, Slack, and Notion, and use them through the account you connect. A site without a connection can be opened in the browser on the Bot's cloud computer.",
    ],
    [
      "Can several agents share the work?",
      `Yes. Put several Bots in one group chat and they pass work between themselves, or have one Bot brief another and pick up the result. The free plan includes one Bot; Pro includes up to ${paidBots}.`,
    ],
    [
      "What happens when the agent is unsure?",
      "It asks. A Bot stops and puts a question in the chat, and on your phone if you have the app, rather than guessing at something it would have to undo.",
    ],
    [
      "Can the agent run while I am offline?",
      `Yes. Routines post a prompt into the Bot's chat on a schedule, and a task keeps running after you close the tab. The free plan includes ${ROUTINE_LIMITS.free} routine and Pro up to ${ROUTINE_LIMITS.paid}. A task can still stop early at your usage allowance or step limit.`,
    ],
  ],
  related: [
    {
      label: "AI employees",
      href: "/ai-employees",
      description: "Giving a Bot a job title, a brief, and a manager.",
    },
    {
      label: "AI agent vs chatbot",
      href: "/ai-agent-vs-chatbot",
      description: "The difference in one page, with examples.",
    },
    {
      label: "How Krafty Bot works",
      href: "/how-it-works",
      description:
        "Memory, the shared cloud computer, connected apps, routines, and approvals.",
    },
  ],
}

export const aiEmployeesPage: MarketingPage = {
  path: "/ai-employees",
  title: "AI employees: giving an agent a job, not a prompt",
  description:
    "What an AI employee is, how to write its job description, which roles work today, how you supervise it, and where the employee comparison stops being useful.",
  summary:
    "How to give a Bot a role and a brief, which roles work today, and how you supervise it.",
  h1: "AI employees",
  lead: "An AI employee is an agent that owns an ongoing job rather than answering one prompt: it has a role, a brief, the tools for the work, and someone it reports to. Krafty Bot does not employ anyone and does not replace payroll. It gives you Bots you name, instruct, and supervise, and this page is about doing that well.",
  sections: [
    {
      id: "meaning",
      title: "What do people mean by an AI employee?",
      body: "Usually three things at once: the agent keeps context from one day to the next, it works inside the same tools a person in that role would use, and it carries a job over time instead of starting from zero each chat. On Krafty, that is a Bot with a saved role and working instructions, its own memory, and the account's shared cloud computer. The word employee is a useful shorthand for that shape of work. It is not a claim that the Bot is a person or that it never needs checking.",
    },
    {
      id: "job-description",
      title: "How do you write a job description for a Bot?",
      body: "The same way you would brief a contractor on their first day: what the job is, what good looks like, what to leave alone, and when to ask. A new Bot asks you these questions in its first chat and saves the answers as its working instructions.",
      bullets: [
        'The job in one or two sentences, with the apps it lives in. "Every Friday, collect the week\'s receipts from Gmail and log them in the Expenses sheet."',
        "What finished looks like. A ranked sheet, a drafted reply, a Slack summary, a filed issue.",
        "What it must never do alone. Send mail, change a bid, delete anything. On Krafty, writes to connected apps already wait for you by default.",
        "What to remember. Your tone for drafts, the folder names, who owns which category. Bots keep the notes you ask them to save.",
      ],
    },
    {
      id: "roles",
      title: "Which roles work today?",
      body: "Roles with a clear input, a clear output, and a few apps in between. Each of these has a page with the starter prompt, what the Bot does on its own, and what waits for you.",
      cards: [
        {
          title: "Sales Outbound",
          body: "Researches accounts overnight, finds the contact, drafts in your voice, and leaves a ranked review list. Nothing is sent.",
          href: "/use-cases/sales-outbound",
        },
        {
          title: "Chief of Staff",
          body: "Reads unread mail, DMs, and today's calendar each morning and sends one brief with drafts waiting in Gmail.",
          href: "/use-cases/chief-of-staff",
        },
        {
          title: "Support Triage",
          body: "Drafts replies to how-to questions from your help center, routes billing issues, and links or drafts bug reports.",
          href: "/use-cases/support-triage",
        },
        {
          title: "Expense Manager",
          body: "Files receipts, logs each one in your sheet, and flags anything large or uncategorized.",
          href: "/use-cases/expense-manager",
        },
      ],
      links: [
        { label: "All nine roles with starter prompts", href: "/use-cases" },
      ],
    },
    {
      id: "supervision",
      title: "How do you supervise an AI employee?",
      body: "You review its writes, you read its activity, and you widen its permissions one action at a time as it earns them. On Krafty that is built in rather than left to the Bot's judgment.",
      bullets: [
        "Reading your connected apps needs no approval. Sending, posting, or updating a record waits for your OK.",
        "You can always allow a specific action for a specific Bot, bound to that connected account. High-risk actions can never be always allowed.",
        "On the cloud computer, each click and keypress is checked by a separate model against a screenshot, and committing steps run only inside an approval you gave.",
        "Every unattended run is labeled in the transcript and on the Activity page, so you can see what started it and what it did.",
        "Approval requests expire after seven days. A decline blocks every new request for the rest of that turn.",
      ],
      links: [
        { label: "How approvals work", href: "/ai-agent-human-approval" },
      ],
    },
    {
      id: "limits",
      title: "Where does the employee comparison stop being useful?",
      body: "A Bot does not notice what you did not tell it to notice, does not remember what you did not ask it to save, and does not have judgment about your business beyond its instructions and what it reads. It can stop early when a usage allowance or step limit is reached, or when a provider is down. Treat it as a capable new hire on their first week, for as long as you use it: specific briefs, visible work, and widening trust by action rather than all at once.",
    },
    {
      id: "team",
      title: "When is one Bot not enough?",
      body: `Split the job when it spans two roles that would be two people, such as research and outreach, or triage and engineering. Put the Bots in one group chat and they pass work between themselves, or have one Bot brief another and pick up the result. All the Bots on your account share one cloud computer, so files and browser sign-ins carry over between them. Pro includes up to ${paidBots} Bots.`,
      links: [
        { label: "What makes an agent a teammate", href: "/ai-teammates" },
      ],
    },
  ],
  faqs: [
    [
      "Are Krafty Bots real employees?",
      "No. They are AI agents you configure and supervise. You approve app writes and risky computer steps, you can disconnect an app or delete a Bot at any time, and nothing a Bot does creates an employment relationship.",
    ],
    [
      "Can an AI employee work while I am offline?",
      "Yes. Routines post work into the Bot's chat on a schedule, and a task keeps running after you close the browser until a step needs your approval or a plan limit applies.",
    ],
    [
      "Do AI employees share one computer?",
      "Yes. Each account has one persistent cloud computer shared by all its Bots, so files and browser sign-ins carry over from one Bot to the next. The computer pauses when idle and resumes when a Bot needs it.",
    ],
    [
      "How many Bots can I run?",
      `The free plan includes one Bot. Pro includes up to ${paidBots} Bots, unlimited connected apps, and ${paidHours} hours of cloud computer time each billing period.`,
    ],
    [
      "How is an AI employee different from an AI teammate?",
      "On Krafty they are the same Bot. Employee describes the shape of the work, a role carried over time. Teammate describes how it fits in: a name in your chats, memory, handoffs between Bots, and approvals that keep you in the loop.",
    ],
  ],
  related: [
    {
      label: "AI teammates",
      href: "/ai-teammates",
      description: "What turns an agent into a teammate you can hand work to.",
    },
    {
      label: "AI agents for small business",
      href: "/ai-agents-for-business",
      description: "Which jobs to hand off first and what it costs.",
    },
    {
      label: "Autonomous AI agent",
      href: "/autonomous-ai-agent",
      description: "How far a Bot goes on its own, and what stops it.",
    },
  ],
}

export const autonomousAiAgentPage: MarketingPage = {
  path: "/autonomous-ai-agent",
  title: "What is an autonomous AI agent? Definition, limits",
  description:
    "An autonomous AI agent plans and takes multi-step actions toward a goal without being told each step. How much autonomy is useful, and what should stop it.",
  summary:
    "The definition, how much autonomy is useful, and what stops a Bot on Krafty.",
  h1: "What is an autonomous AI agent?",
  lead: "An autonomous AI agent is software that takes a goal, plans the steps, uses tools to carry them out, and keeps going without you typing each instruction. The useful question is not whether an agent is autonomous but what it may do without you, and what makes it stop and ask. This page answers both, with Krafty Bot as the worked example.",
  sections: [
    {
      id: "definition",
      title: "The definition in one paragraph",
      body: "An agent is autonomous when it can take an outcome you describe, break it into steps, carry out those steps with tools such as a browser, your apps, or a terminal, check its own progress, and continue across time without a person prompting each move. A chat assistant answers one message at a time while you watch. An autonomous agent is still working after you close the laptop. Autonomy is a dial, not a switch: most useful agents act freely on reads and pause on writes.",
    },
    {
      id: "how-much",
      title: "How much autonomy is useful?",
      body: "Enough to finish the boring middle of a job, and not so much that you have to undo anything. The middle is reading, searching, comparing, drafting, and filling in rows. The ends are where it matters: deciding what the job is, and committing the result by sending, posting, paying, or changing a record. A good agent takes the middle and hands you the ends.",
      cards: [
        {
          title: "Act freely",
          body: "Read your inbox and sheets, search the web, open sites in a browser, draft text, rank options, take screenshots.",
        },
        {
          title: "Pause and ask",
          body: "Send an email, post to a channel, change a bid, update a CRM record, submit a form that commits something, delete anything.",
        },
        {
          title: "Never alone",
          body: "High-risk actions, account security changes, and terminal commands on the shared computer cannot be pre-approved on Krafty.",
        },
      ],
    },
    {
      id: "on-krafty",
      title: "What autonomy looks like on Krafty Bot",
      body: "Three things happen without you at the keyboard, and each one is visible in the chat and on the Activity page.",
      bullets: [
        `Routines. A Bot runs a saved job daily, every few hours, or once at a set time, in your timezone. The free plan includes ${ROUTINE_LIMITS.free} routine and Pro up to ${ROUTINE_LIMITS.paid}.`,
        "Unattended turns. A task keeps running after you close the browser, on the apps you connected and on the account's cloud computer with its desktop and browser.",
        "Handoffs. A Bot can brief another Bot and pick up the result, and several Bots in one group chat pass work between themselves.",
        "Every unattended run is labeled with what started it, and a turn that was cut off by its step or time cap continues without gaining any new permission.",
      ],
    },
    {
      id: "stops",
      title: "What stops an autonomous agent?",
      body: "On Krafty, four things, by design: an approval gate, a usage allowance, a step cap, and a second model watching the screen.",
      bullets: [
        "Writes to connected apps wait for your approval unless you chose to always allow that action for that Bot. High-risk actions can never be always allowed.",
        "On the cloud computer, each click, drag, Enter, and non-navigation key is judged by a separate model from a screenshot the server takes. The check fails closed. Steps that commit something run only inside an approval you gave for that Bot and chat.",
        "Each turn has a running cost. When your AI allowance or computer time runs out, or a step limit is reached, the turn stops and tells you.",
        "Nothing in a web page, email, document, or tool result can approve an action. Only your decision can.",
      ],
      links: [
        {
          label: "The approval model in detail",
          href: "/ai-agent-human-approval",
        },
      ],
    },
    {
      id: "compare",
      title: "Autonomous agent, assistant, or automation?",
      cards: [
        {
          title: "Chat assistant",
          body: "Answers in a window while you watch. Great for drafting and explaining. It does not go and do the thing.",
          href: "/ai-agent-vs-chatbot",
        },
        {
          title: "Workflow automation",
          body: "Runs the exact steps you wired up in advance. Reliable for fixed paths, brittle when a page or a format changes.",
        },
        {
          title: "Autonomous agent",
          body: "Takes a goal in plain language, works out the steps, uses a browser when there is no integration, and asks when something is unclear.",
        },
      ],
    },
    {
      id: "builder",
      title: "Do you need an agent builder?",
      body: "Not on Krafty. Many products ship a canvas or an SDK where you wire tools to prompts. Krafty Bot is closer to hiring: you create a Bot, answer its setup questions, and describe the job in plain language. When a job goes well, you ask the Bot to repeat it and it saves a routine. There is no separate canvas, no nodes, and no code to deploy.",
      links: [
        {
          label: "AI agents for small business",
          href: "/ai-agents-for-business",
        },
        {
          label: "Alternatives that work on a cloud computer",
          href: "/manus-alternatives",
        },
      ],
    },
  ],
  faqs: [
    [
      "Is Krafty Bot fully autonomous?",
      "No, on purpose. It keeps working in the background, but writes to connected apps and committing steps on the computer wait for your approval unless you allowed that specific action for that Bot. High-risk actions always wait.",
    ],
    [
      "Can an autonomous agent be tricked by a web page?",
      "It can be misled, which is why approvals do not come from the agent. On Krafty, nothing a page, email, or document says can approve an action, and the screen check is a separate model from the one doing the work. The check reduces risk; it cannot remove it.",
    ],
    [
      "What is the difference between a routine and an autonomous agent?",
      "A routine is the schedule. The Bot that runs it is the agent. A routine posts the saved prompt into the Bot's chat at the set time, and the Bot works through it with the same approvals as any other turn.",
    ],
    [
      "Where should I start?",
      "Pick one concrete job, such as receipts, support triage, or a morning brief, from the use-case library. Run it once in chat, check the result, then ask the Bot to repeat it on a schedule.",
    ],
  ],
  related: [
    {
      label: "AI agent with human approval",
      href: "/ai-agent-human-approval",
      description:
        "Exactly what waits for you, and what cannot be pre-approved.",
    },
    {
      label: "AI employees",
      href: "/ai-employees",
      description: "Giving a Bot a role it carries over time.",
    },
    {
      label: "Use cases",
      href: "/use-cases",
      description: "Nine jobs with starter prompts.",
    },
  ],
}

export const manusAlternativesPage: MarketingPage = {
  path: "/manus-alternatives",
  title: "Manus alternatives: 5 agents with a cloud computer",
  description:
    "Looking for a Manus alternative? Five agents that work on their own cloud computer, described from their own sites, with what to check before you switch.",
  summary:
    "Five agents that work on a cloud computer, in their own words, and what to check before switching.",
  h1: "Manus alternatives",
  lead: "Manus is a general-purpose AI agent that works in a cloud computer: you give it a goal and it browses, writes files, and runs code to get there. If you are looking for an alternative, the field has grown. This page describes five options the way their own sites do, lists what to check before you move a job, and explains where Krafty Bot fits. It does not score anyone.",
  sections: [
    {
      id: "what-manus-is",
      title: "What is Manus?",
      body: "Manus takes a task and carries it out in an isolated cloud environment with a browser, a file system, and a command line, so you can close your laptop while it works. Its site offers starting points for slides, websites, games, video, and design, a Wide Research feature, a Slack integration, web, desktop and mobile apps, a team plan, and an API. We are not affiliated with Manus and cannot verify its features or roadmap beyond what its site says.",
      links: [
        { label: "Source: Manus product overview", href: "https://manus.im/" },
      ],
    },
    {
      id: "why-switch",
      title: "Why do people look for a Manus alternative?",
      bullets: [
        "They want agents that live inside the tools they already use, such as Gmail, Sheets, Slack, or a CRM, rather than a general workspace that produces files.",
        "They want several named agents with their own roles and memory, not one general agent.",
        "They want an explicit approval gate before anything is sent, posted, or changed in their accounts.",
        "They want scheduled work that keeps running when the chat is closed.",
        "They want a free plan to try one real job before paying.",
      ],
    },
    {
      id: "alternatives",
      title: "Five Manus alternatives",
      body: "Each description is drawn from the product's own site. Visit the site for current features and prices.",
      cards: [
        {
          title: "Krafty Bot",
          body: `Named Bots with their own memory and instructions, one persistent cloud computer per account shared by all of them, connected apps through your own sign-ins, routines on a schedule, group chats and handoffs, and approval before any write to a connected app. Free to start with one Bot; Pro is $20 a month.`,
          href: "/how-it-works",
        },
        {
          title: "Grok Bot (xAI)",
          body: "Persistent Bots described as AI teammates with names, jobs, and context that compounds over time. Each works on a cloud computer with a browser, file system, and terminal, all Bots on an account share one computer, workflows can be saved as skills and rerun on a schedule, and Bots come back when something needs approval. Included with SuperGrok, Cursor, and Grok Business plans.",
          href: "https://docs.x.ai/grok-bot/overview",
        },
        {
          title: "ChatGPT agent (OpenAI)",
          body: "An agent mode inside ChatGPT that carries out tasks on its own virtual computer with a browser, uses connectors to your apps, and asks for permission before actions with real-world consequences. Available on ChatGPT's paid plans.",
          href: "https://openai.com/index/introducing-chatgpt-agent/",
        },
        {
          title: "Lindy",
          body: "Describes itself as an AI employee that plugs into your tools, with more than 1,500 integrations, skills you teach once for the whole team, triggers on a schedule or an event, browser use on higher plans, and approval before irreversible actions. Free credits to start, then team pricing per active user.",
          href: "https://www.lindy.ai/",
        },
        {
          title: "Manus Desktop with My Computer",
          body: "If what you miss is the agent working on your own machine rather than in the cloud, Manus's own desktop app adds a My Computer capability that works with local files, tools, and applications. Worth checking before switching vendors.",
          href: "https://manus.im/",
        },
      ],
      note: vendorNote,
    },
    {
      id: "check",
      title: "What to check before you move a job",
      bullets: [
        "Can the agent use your existing accounts in apps and in a browser, and who holds the sign-in?",
        "Does work continue on a schedule and after the chat is closed?",
        "Where is context kept between sessions, and can you read and edit it?",
        "What exactly waits for a human before mail goes out, money moves, or a record changes, and can that be narrowed per action?",
        "How is pricing metered: seats, tasks, model usage, computer time, or credits, and is there a free plan?",
        "Can you export or delete your data and disconnect apps at any time?",
      ],
    },
    {
      id: "krafty-fit",
      title: "Where Krafty Bot fits",
      body: "Krafty Bot is built for jobs that live in your own apps and repeat: inbox and calendar briefs, receipts, support triage, outbound research, reporting. Each Bot is a teammate with a role and memory, all Bots share one cloud computer with a desktop and browser, and every write to a connected app waits for your approval unless you allowed that action for that Bot. It is less suited to one-off creative builds such as generating a game or a slide deck. Try it on the free plan with a throwaway workflow if you want firsthand behavior.",
      links: [
        { label: "How Krafty Bot works", href: "/how-it-works" },
        { label: "Grok Bot alternatives", href: "/grokbot-alternatives" },
        { label: "Use cases with starter prompts", href: "/use-cases" },
      ],
    },
  ],
  faqs: [
    [
      "Is Krafty Bot a Manus replacement?",
      "For jobs inside your own apps that repeat on a schedule, it can be. For one-off creative outputs such as slides, websites, or games, Manus's own starting points are built for that and Krafty is not. Only you can decide which jobs you actually gave the other tool.",
    ],
    [
      "Which Manus alternative has a free plan?",
      "Krafty Bot has a free plan with one Bot, one connected app, a one-time AI allowance, and a few minutes of computer time. Lindy's site lists free starting credits. Check each site for current terms.",
    ],
    [
      "Does Krafty Bot run tasks without me?",
      "Yes. Routines run on a schedule and a task keeps going after you close the browser, but writes to connected apps and committing steps on the computer wait for your approval unless you allowed that specific action for that Bot.",
    ],
    [
      "Can I use my own app accounts?",
      "Yes. You connect each app yourself and can disconnect it at any time. Bots never receive your passwords in chat.",
    ],
  ],
  related: [
    {
      label: "Grok Bot alternatives",
      href: "/grokbot-alternatives",
      description:
        "Agents with a shared computer, if you don't have a SuperGrok or Cursor plan.",
    },
    {
      label: "Autonomous AI agent",
      href: "/autonomous-ai-agent",
      description: "What autonomy means and what stops it.",
    },
    {
      label: "AI agent with human approval",
      href: "/ai-agent-human-approval",
      description: "What waits for you on Krafty.",
    },
  ],
}

export const grokBotAlternativesPage: MarketingPage = {
  path: "/grokbot-alternatives",
  title: "Grok Bot alternatives: 4 AI teammate products",
  description:
    "Grok Bot alternatives if you don't have a SuperGrok or Cursor plan: four agents with named Bots, a shared computer, and approvals, in their own words.",
  summary:
    "Agents with named Bots, a shared cloud computer and approvals, for people without a SuperGrok or Cursor plan.",
  h1: "Grok Bot alternatives",
  lead: "Grok Bot is xAI's team of persistent AI assistants: named Bots with jobs and memory that work on a shared cloud computer and come back to you for approvals. Its documentation lists eligible paid Cursor, linked SuperGrok, and self-serve Grok Business plans; check the current eligibility before choosing. If you want that shape of product without one of those subscriptions, or with a different approval model, this page lists the alternatives the way their own sites describe them and explains where Krafty Bot fits.",
  sections: [
    {
      id: "what-grok-bot-is",
      title: "What is Grok Bot?",
      body: "According to xAI's documentation, Grok Bot gives you AI teammates with names, jobs, and context that compounds over time. Each Bot works on a persistent cloud computer with a browser, file system, and terminal, and all the Bots on your account share that one computer, including its files, browser sessions, and app logins. Bots use connected apps where available and the computer for everything else, keep working while your laptop is closed, can save a multi-step workflow as a skill and rerun it on a schedule, and come back to you when something needs your approval. The overview documentation lists every paid individual Cursor plan, Cursor Teams, linked individual SuperGrok subscriptions, and self-serve Grok Business seats as access paths, with usage limits. Check the current plan matrix before subscribing. We are not affiliated with xAI.",
      links: [
        {
          label: "Source: Grok Bot overview and plan eligibility",
          href: "https://docs.x.ai/grok-bot/overview",
        },
      ],
    },
    {
      id: "why-alternative",
      title: "Why look for a Grok Bot alternative?",
      bullets: [
        "You don't have, or don't want, a SuperGrok, Cursor, or Grok Business subscription.",
        "You want a free plan to try one real job first.",
        "You want every write to a connected app held for approval by default, with the option to allow specific actions per Bot.",
        "You want the agent to live in Gmail, Sheets, Slack, or your CRM through your own sign-ins rather than mainly on a computer.",
        "You want to run on the web without installing a desktop app.",
      ],
    },
    {
      id: "alternatives",
      title: "Four Grok Bot alternatives",
      body: "Each description is drawn from the product's own site. Visit the site for current features and prices.",
      cards: [
        {
          title: "Krafty Bot",
          body: `Named Bots with their own memory and working instructions. One persistent cloud computer per account with a desktop and browser, shared by all its Bots, so files and sign-ins carry over. Connected apps through your own sign-ins, routines on a schedule, group chats and handoffs, and approval before any write to a connected app. Runs in the browser on laptop and phone, with an Android app. Free to start; Pro is $20 a month.`,
          href: "/how-it-works",
        },
        {
          title: "ChatGPT agent (OpenAI)",
          body: "An agent mode inside ChatGPT that carries out tasks on its own virtual computer with a browser, uses connectors to your apps, and asks for permission before actions with real-world consequences. Available on ChatGPT's paid plans.",
          href: "https://openai.com/index/introducing-chatgpt-agent/",
        },
        {
          title: "Manus",
          body: "A general agent that takes a goal and carries it out in an isolated cloud computer with a browser, file system, and command line. Its site offers starting points for slides, websites, games, video, and design, a Slack integration, web, desktop, and mobile apps, and an API.",
          href: "https://manus.im/",
        },
        {
          title: "Lindy",
          body: "Describes itself as an AI employee that plugs into your tools, with more than 1,500 integrations, skills you teach once for the whole team, triggers on a schedule or an event, browser use on higher plans, and approval before irreversible actions.",
          href: "https://www.lindy.ai/",
        },
      ],
      note: vendorNote,
    },
    {
      id: "compare",
      title: "Krafty Bot compared with Grok Bot, in plain words",
      body: "The two products have the same shape, so the differences are in the details. This is what each one's own documentation says, not a scorecard.",
      cards: [
        {
          title: "Shared computer",
          body: "Both: one persistent cloud computer per account, shared by all Bots, with files and browser sessions that carry over. Grok Bot's docs add a file system and terminal per Bot screen; Krafty gives Bots a desktop and browser, and holds terminal commands on it to a stricter rule.",
        },
        {
          title: "Approvals",
          body: "Both come back to you for approval. On Krafty, every write to a connected app waits by default, you can always-allow a specific action for a specific Bot, high-risk actions never qualify, and a separate model checks each click on the computer against a screenshot.",
        },
        {
          title: "Scheduled work",
          body: "Grok Bot saves a workflow as a skill and reruns it on a schedule. Krafty saves a job that went well as a routine that runs daily, every few hours, or once at a set time, in your timezone.",
        },
        {
          title: "Memory and handoffs",
          body: "Both keep per-Bot memory and context across sessions, and both let Bots hand work to each other. On Krafty, memory is the notes you ask a Bot to save, separate from chat history, and you can read and edit it.",
        },
        {
          title: "Where it runs",
          body: "Grok Bot lists desktop apps for macOS, Windows, and Linux and mobile apps, plus tagging a Bot on X in some regions. Krafty runs in the browser on any laptop or phone, with an Android app and an iPhone app on the way.",
        },
        {
          title: "Plans",
          body: "Grok Bot is included with SuperGrok, Cursor, and Grok Business plans, with usage metered separately. Krafty has a free plan and a $20 a month Pro plan, with an AI allowance and computer hours in each. People who sign in with a ChatGPT plan can run model calls on that plan.",
        },
      ],
      note: vendorNote,
    },
    {
      id: "check",
      title: "What to check before you choose",
      bullets: [
        "Which subscriptions you already pay for, and whether an agent is bundled with one of them.",
        "Which of your apps have a connector, and whether the agent can use a browser for the rest.",
        "What waits for a human by default, and whether you can narrow that per action and per Bot.",
        "Whether you need a desktop app, a mobile app, or just a browser.",
        "How usage is metered and what happens when the allowance runs out mid-task.",
      ],
      links: [
        { label: "How Krafty Bot works", href: "/how-it-works" },
        { label: "What makes an agent a teammate", href: "/ai-teammates" },
        { label: "Manus alternatives", href: "/manus-alternatives" },
      ],
    },
  ],
  faqs: [
    [
      "Is Krafty Bot a Grok Bot alternative?",
      "Yes, for the same shape of work: named Bots with memory on one shared cloud computer, with approvals and scheduled routines. Krafty has a free plan and a $20 Pro plan rather than being bundled with a SuperGrok or Cursor subscription, and it holds every connected-app write for approval by default.",
    ],
    [
      "Do I need a Grok or Cursor subscription for Krafty Bot?",
      "No. Krafty is a separate product with its own free and Pro plans. If you sign in with a ChatGPT plan, your Bots' model calls can run on that plan instead of the AI allowance.",
    ],
    [
      "Does Krafty Bot have a terminal on the cloud computer?",
      "Bots have a desktop and a browser on the shared computer and can run shell commands, but risky commands are refused or held for your approval, and account-security changes and terminal commands can never be pre-approved. We treat the shell as a convenience, not as a security boundary.",
    ],
    ["Can I try Krafty Bot without paying?", `Yes. ${startFree}`],
  ],
  related: [
    {
      label: "AI teammates",
      href: "/ai-teammates",
      description: "What turns an agent into a teammate you can hand work to.",
    },
    {
      label: "Manus alternatives",
      href: "/manus-alternatives",
      description: "Five agents with a cloud computer, in their own words.",
    },
    {
      label: "AI agent with human approval",
      href: "/ai-agent-human-approval",
      description: "Exactly what waits for you on Krafty.",
    },
  ],
}

export const aiTeammatesPage: MarketingPage = {
  path: "/ai-teammates",
  title: "AI teammates: what they are, how to work with one",
  description:
    "An AI teammate is an agent with a name, a role, memory, its own tools, and a place in your chats. What makes one, how they work together, and where to start.",
  summary:
    "What makes an agent a teammate: a name, a role, memory, tools, handoffs, and approvals.",
  h1: "AI teammates",
  lead: "An AI teammate is an agent you can hand work to the way you would hand it to a colleague: it has a name, a role, memory of how you like things done, the tools for the job, and a place in your chats where it reports back. Krafty Bot is built around that idea. This page explains what separates a teammate from a chatbot or a script, how teammates work together, and what they still can't do.",
  sections: [
    {
      id: "what-makes",
      title: "What makes an agent a teammate?",
      body: "Six things. Take any one away and you have a tool; keep all six and you have something you can brief on Monday and hear back from on Tuesday.",
      cards: [
        {
          title: "A name and a role",
          body: "A Bot is created with a name, a job, and working instructions it saves from a short setup chat. You message it by name, alone or in a group.",
        },
        {
          title: "Memory",
          body: "A Bot keeps the notes you ask it to save, separate from chat history, and uses them in every later chat. You can read and edit them.",
        },
        {
          title: "Its own tools",
          body: "Connected apps through your sign-ins, web research, and a cloud computer with a desktop and browser for sites that have no integration.",
        },
        {
          title: "Time",
          body: "A task keeps running after you close the browser, and routines run on a schedule in your timezone.",
        },
        {
          title: "Handoffs",
          body: "A Bot can brief another Bot and pick up the result, and Bots in one group chat pass work between themselves. You can follow every handoff in the thread.",
        },
        {
          title: "A way to say no",
          body: "Writes to connected apps and committing steps on the computer wait for your approval. The teammate asks; you decide.",
        },
      ],
    },
    {
      id: "a-day",
      title: "What does a day with an AI teammate look like?",
      body: "Here is an example of a Chief of Staff Bot's morning routine, as the starter prompt describes it. It is an illustration, not a transcript. At 7:30 the routine posts its prompt into the Bot's chat. The Bot reads your unread Gmail, Slack DMs, and today's calendar, writes a three-bullet brief on each attendee from past emails, drafts replies to the mail that needs an answer today, and lists the threads you promised to follow up on. The drafts stay in Gmail as drafts. Sending you the brief in Slack is a send, so it asks every morning; Krafty never lets a send or post be always allowed. You tap Approve on your phone, read the brief, and send the two drafts that are ready.",
      links: [
        {
          label: "The Chief of Staff starter prompt",
          href: "/use-cases/chief-of-staff",
        },
      ],
    },
    {
      id: "vs",
      title: "Teammate, assistant, employee, or agent?",
      body: "People use these words for overlapping things. Here is how we use them.",
      cards: [
        {
          title: "Chat assistant",
          body: "Answers in a window while you watch. It explains and drafts; it doesn't go and do the thing.",
          href: "/ai-agent-vs-chatbot",
        },
        {
          title: "Autonomous agent",
          body: "Plans and takes multi-step actions toward a goal. Says what the software can do, not how it fits into your work.",
          href: "/autonomous-ai-agent",
        },
        {
          title: "AI employee",
          body: "An agent that owns an ongoing job with a role and a brief. Describes the shape of the work.",
          href: "/ai-employees",
        },
        {
          title: "AI teammate",
          body: "An agent with a name, memory, tools, and a place in your chats, that hands work to and from others and asks before it commits. Describes how it fits in.",
        },
      ],
    },
    {
      id: "together",
      title: "How do AI teammates work together?",
      body: "Two ways on Krafty. In a group chat, you put several Bots in one thread, give them the job, and they pass work between themselves while you watch the handoffs. In a brief, one Bot sends another a task and picks up the result when it is done, inside its own turn. Either way, all the Bots on your account share one cloud computer, so a file one Bot downloaded or a site one Bot signed in to is there for the next. Delegated work goes through the same approval gates as anything else, and a handed-off task never gains a permission the original turn did not have.",
    },
    {
      id: "cannot",
      title: "What an AI teammate still can't do",
      bullets: [
        "Notice what you did not ask it to look at, or remember what you did not ask it to save.",
        "Approve its own work. Nothing in a web page, email, or document can approve an action either; only you can.",
        "Keep going forever. A task stops at your usage allowance or step limit, or when a provider is down, and tells you.",
        "Guarantee a site will cooperate. Some sites block automation, expire sessions, or need a human step such as a code from your phone, and the Bot hands those to you.",
      ],
    },
    {
      id: "start",
      title: "How to start with one teammate",
      body: `Pick one job you keep putting off. Create a Bot, answer its setup questions, and give it the job in plain language, or paste a starter prompt from the use-case library. Connect the one app it needs when it asks. Check the first result, then say "do this every Friday" and it becomes a routine. Add a second Bot when there is a second job. ${startFree}`,
      links: [
        { label: "Nine jobs with starter prompts", href: "/use-cases" },
        { label: "How Krafty Bot works", href: "/how-it-works" },
      ],
    },
  ],
  faqs: [
    [
      "What is an AI teammate?",
      "An AI agent with a name, a role, memory, its own tools, and a place in your chats, that takes a job, works through it in your apps and on a cloud computer, hands work to and from other Bots, and asks before anything goes out. On Krafty, each Bot is one.",
    ],
    [
      "How many AI teammates can I have?",
      `One on the free plan and up to ${paidBots} on Pro. All the Bots on an account share one cloud computer, memory is per Bot, and routines are counted per account: ${ROUTINE_LIMITS.free} on free and up to ${ROUTINE_LIMITS.paid} on Pro.`,
    ],
    [
      "Can AI teammates talk to each other?",
      "Yes. Put several in one group chat, or have one brief another and pick up the result. You can follow every handoff in the thread, and delegated work goes through the same approvals.",
    ],
    [
      "Do AI teammates replace people?",
      "They take the repetitive middle of jobs: reading, searching, drafting, filing, ranking. The decisions and the sending stay with you. Krafty does not employ anyone and does not make claims about headcount.",
    ],
    [
      "Where do I talk to my teammates?",
      "In your browser on a laptop or phone, and in the Android app, with an iPhone app on the way. Each Bot has its own chat, there are group chats, and an Activity page shows anything waiting on you.",
    ],
  ],
  related: [
    {
      label: "AI employees",
      href: "/ai-employees",
      description: "Writing a job description for a Bot and supervising it.",
    },
    {
      label: "Grok Bot alternatives",
      href: "/grokbot-alternatives",
      description: "Products built around the same idea, in their own words.",
    },
    {
      label: "AI agent with human approval",
      href: "/ai-agent-human-approval",
      description: "What waits for you, and what never gets pre-approved.",
    },
  ],
}

export const aiAgentHumanApprovalPage: MarketingPage = {
  path: "/ai-agent-human-approval",
  title: "AI agent with human approval: what waits for you",
  description:
    "How an AI agent with human approval works on Krafty Bot: what needs your OK, what doesn't, how always-allow is bounded, and what the gate can't guarantee.",
  summary:
    "What needs your OK on Krafty, what doesn't, how always-allow is bounded, and what the gate can't guarantee.",
  h1: "AI agents with human approval",
  lead: "An AI agent with human approval does the reading, searching, and drafting on its own and stops before anything that would be hard to undo: sending, posting, paying, or changing a record. On Krafty Bot that gate is enforced by the server, not left to the model's judgment. This page says exactly what waits for you, what doesn't, and what the gate cannot promise.",
  sections: [
    {
      id: "why",
      title: "Why does an agent need human approval?",
      body: "Because the costly mistakes are the committing ones. A wrong draft costs a minute. A wrong email to a customer, a wrong bid change, or a deleted row costs more than the task saved. Pausing before writes gives you a chance to catch mistakes, although an approval gate cannot remove every risk. It also lets you widen trust one action at a time instead of deciding up front whether to trust the whole thing.",
    },
    {
      id: "needs-approval",
      title: "What needs your approval on Krafty Bot?",
      bullets: [
        "Any write to a connected app: sending an email, posting a message, creating or updating a record, saving a file, adding a row. The Bot's turn stops, you see the request in the chat, on the Activity page, and as a push notification on your phone, and the stored action runs once when you approve it.",
        "Committing steps on the cloud computer: a click, drag, Enter, or key that would submit, send, or change something, as judged by a separate model from a screenshot the server takes.",
        "Risky shell commands on the computer. Obvious ones are refused outright; others are held and run once, exactly as you saw them.",
      ],
    },
    {
      id: "no-approval",
      title: "What doesn't need approval?",
      bullets: [
        "Reading your connected apps: your inbox, sheets, calendar, CRM, tickets.",
        "Searching the web and reading pages, within your plan's allowance.",
        "Opening sites and navigating in the browser on the cloud computer, taking screenshots, and reading what is on screen.",
        "Drafting text in the chat needs no approval. Saving a draft to Gmail is a connected-app write and needs approval unless an eligible rule allows it; sending always needs approval.",
        "Saving notes to the Bot's own memory.",
      ],
    },
    {
      id: "always-allow",
      title: "How do always-allow rules work, and what are their limits?",
      body: "When you approve a request, you can choose to always allow that action. The rule is bound to that Bot, that action, and that connected account, and you can list and remove rules at any time. Three things keep it narrow.",
      bullets: [
        "Sending, posting, replying, deleting, payments, and access changes are high-risk. They ask every time and cannot be always allowed.",
        "A rule covers one action on one account for one Bot. A second Bot, or the same Bot on a second account, asks again.",
        "The approved action runs from the stored call the Bot made, never from arguments the model supplies later.",
      ],
    },
    {
      id: "computer",
      title: "How does approval work on the cloud computer?",
      body: "Every click, drag, Enter, and non-navigation key is sent to a separate vision model along with a screenshot the server takes, and the model decides whether the step is routine or would commit something. Routine steps run. Committing steps run only inside an approval you have given for that Bot and that chat, which is time-boxed. Navigation keys are exempt from the screen check. The check fails closed: if the model cannot decide, the step does not run. Account-security changes and commands typed into a desktop terminal are refused. Eligible shell-tool commands require separate approval when held.",
    },
    {
      id: "guarantees",
      title: "What approval can and can't guarantee",
      body: "Enforced by the server: app writes run only from the stored call; high-risk actions never get a standing rule; rules are bound to Bot, account, and action, and revocable; the computer guard fails closed; a decline blocks every new request for the rest of that turn, and an app call declined unchanged is refused for a day; nothing in a web page, document, or tool result can grant an approval. Reduced, not removed: the computer guard is a model reading pixels and can be wrong or misled by an overlay or a misleading label; typing without Enter can still commit on some sites; and the shell on the computer is a convenience, not a security boundary. We would rather you know that than find out.",
      links: [
        { label: "How Krafty Bot works", href: "/how-it-works#approvals" },
      ],
    },
    {
      id: "where",
      title: "Where do you approve?",
      body: "In the chat, where the request appears as a card with Approve and Decline, plus Always allow only for eligible actions. On the Activity page, which lists every pending approval, routine, and recent unattended event. And on your phone, where a push notification can bring you back to the request. Always allow never creates a rule for high-risk actions or computer steps. Requests expire after seven days. Deciding wakes the Bot, which continues the job with your answer.",
      links: [
        { label: "Autonomous AI agent", href: "/autonomous-ai-agent" },
        { label: "AI teammates", href: "/ai-teammates" },
      ],
    },
  ],
  faqs: [
    [
      "Can I turn approvals off?",
      "Not globally. You can always-allow specific actions for specific Bots on specific connected accounts, except high-risk actions. That is the whole mechanism, and it is deliberate.",
    ],
    [
      "Does the agent wait forever for my approval?",
      "The request stays open for seven days. The turn that asked has ended; when you decide, a message wakes the Bot and it continues with your answer. If you decline, the Bot stops asking for the rest of that turn.",
    ],
    [
      "Can a web page or email tell the Bot it is approved?",
      "No. Approvals are recorded only by your decision in the app. Text in a page, a document, or a tool result cannot grant one, and the screen check on the computer is a separate model from the one doing the work.",
    ],
    [
      "Do routines and delegated tasks get the same approvals?",
      "Yes. A routine posts a prompt into the Bot's chat and the turn runs with the same gates as any other. A task one Bot hands to another cannot gain a permission the original turn did not have.",
    ],
  ],
  related: [
    {
      label: "Autonomous AI agent",
      href: "/autonomous-ai-agent",
      description: "What autonomy means and what stops it.",
    },
    {
      label: "AI agents for small business",
      href: "/ai-agents-for-business",
      description: "Which jobs to hand off first.",
    },
    {
      label: "Use cases",
      href: "/use-cases",
      description: "Every role page lists what waits for you.",
    },
  ],
}

export const aiAgentVsChatbotPage: MarketingPage = {
  path: "/ai-agent-vs-chatbot",
  title: "AI agent vs chatbot: the difference, with examples",
  description:
    "A chatbot answers in a window while you watch. An AI agent takes the job, works in your apps and a browser, and comes back with the result. Five differences.",
  summary:
    "Five differences between an agent and a chatbot, and when each one is enough.",
  h1: "AI agent vs chatbot",
  lead: "The short answer: a chatbot answers your question, and an AI agent does your task. A chatbot drafts the email; an agent finds the right person, drafts the email in your voice, and holds it for you to send. Both use the same kind of model underneath. The difference is what sits around the model: tools, memory, time, and a gate before anything goes out.",
  sections: [
    {
      id: "chatbot",
      title: "What does a chatbot do?",
      body: "It takes a message and returns a reply, while you watch, inside its own window. Modern chatbots are very good at explaining, summarizing, drafting, and answering from what you paste in. When the conversation ends, so does the work. If you want the reply in your inbox, you copy it there yourself.",
    },
    {
      id: "agent",
      title: "What does an AI agent do?",
      body: "It takes a goal, works out the steps, and carries them out with tools: your connected apps, a web browser, a file system, sometimes a terminal. It keeps context between sessions, keeps working after you close the window, and comes back with the result or with a question. On Krafty Bot, an agent is a Bot with a name, a role, its own memory, and a share of your account's cloud computer, and anything it writes to a connected app waits for your approval.",
    },
    {
      id: "differences",
      title: "Five differences that matter",
      cards: [
        {
          title: "1. Tools",
          body: "A chatbot has your words. An agent has your apps and a browser, through sign-ins you control, and uses the browser when there is no integration.",
        },
        {
          title: "2. Time",
          body: "A chatbot works while you watch. An agent keeps working after you close the tab and can run on a schedule.",
        },
        {
          title: "3. Memory",
          body: "A chatbot remembers the current conversation. An agent keeps notes between sessions. On Krafty, those are the notes you ask it to save, and you can read and edit them.",
        },
        {
          title: "4. Steps",
          body: "A chatbot answers one message. An agent chains many steps: read, search, compare, draft, file, rank, and checks its own progress.",
        },
        {
          title: "5. A gate",
          body: "A chatbot can't send anything, so it needs no gate. An agent can, so it needs one. On Krafty, writes to connected apps wait for your approval unless you allowed that action for that Bot.",
        },
      ],
    },
    {
      id: "examples",
      title: "The same request, two ways",
      cards: [
        {
          title: "Receipts",
          body: 'Chatbot: "Here is a template for logging expenses." Agent: searches Gmail for this week\'s receipts, saves the PDFs to Drive, logs each in your sheet, and flags the two without a category.',
          href: "/use-cases/expense-manager",
        },
        {
          title: "A customer bug",
          body: 'Chatbot: "Here are common causes of that error." Agent: follows the customer\'s steps on your staging site in its own browser, captures the console error and screenshots, and drafts the issue with numbered steps.',
          href: "/use-cases/bug-reproduction",
        },
        {
          title: "Outbound",
          body: 'Chatbot: "Here is a cold email template." Agent: finds ten accounts that match your brief, skips anyone already in your CRM, drafts a three-sentence note for each in your voice, and ranks them in a sheet. Nothing is sent.',
          href: "/use-cases/sales-outbound",
        },
      ],
    },
    {
      id: "when-chatbot",
      title: "When is a chatbot enough?",
      body: "When the output is words and you are the one who will use them: a first draft, an explanation, a summary of a document you have in front of you, a brainstorm. If the work ends when the reply arrives, a chatbot is the simpler and cheaper tool.",
    },
    {
      id: "when-agent",
      title: "When do you need an agent?",
      body: "When the work continues after the reply: something has to be looked up in three places, filed somewhere, compared with last week, or done again every Friday. When the result should land in your inbox, your sheet, or your tracker rather than in a chat window. And when you want to hand the job off and hear back, rather than sit with it.",
      links: [
        { label: "What makes an agent a teammate", href: "/ai-teammates" },
        {
          label: "What is an autonomous AI agent?",
          href: "/autonomous-ai-agent",
        },
        { label: "Nine jobs with starter prompts", href: "/use-cases" },
      ],
    },
  ],
  faqs: [
    [
      "Is ChatGPT a chatbot or an agent?",
      "Both, depending on the mode. The chat is a chatbot. Its agent mode runs tasks on a virtual computer and asks before consequential actions. The same is true of most assistants now: the label depends on whether it can act in your tools and keep working when you close the window.",
    ],
    [
      "Is an AI agent just a chatbot with plugins?",
      "Plugins add tools, which is one of the five differences. An agent also plans multi-step work, keeps context between sessions, continues when you leave, and has a gate before it commits anything. Tools alone do not make a teammate.",
    ],
    [
      "Does an agent cost more than a chatbot?",
      `Usually, because it runs more model calls per job and may use a computer. Krafty meters both: ${startFree}`,
    ],
    [
      "Can I talk to a Krafty Bot like a chatbot?",
      "Yes. Each Bot has a chat, and asking it a question works like any assistant. The difference shows when you give it a job: it goes and does it, and asks before anything goes out.",
    ],
  ],
  related: [
    {
      label: "AI teammates",
      href: "/ai-teammates",
      description: "What turns an agent into a teammate you can hand work to.",
    },
    {
      label: "AI agents for small business",
      href: "/ai-agents-for-business",
      description: "Which jobs to hand off first and what it costs.",
    },
    {
      label: "How Krafty Bot works",
      href: "/how-it-works",
      description:
        "Memory, the shared cloud computer, apps, routines, approvals.",
    },
  ],
}

export const marketingSeoPages = [
  aiAgentsForBusinessPage,
  aiEmployeesPage,
  aiTeammatesPage,
  autonomousAiAgentPage,
  aiAgentHumanApprovalPage,
  aiAgentVsChatbotPage,
  grokBotAlternativesPage,
  manusAlternativesPage,
] as const

export function marketingPageUrl(path: string) {
  return absoluteUrl(path)
}
