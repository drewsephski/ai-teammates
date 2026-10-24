import { planLimits } from "@/lib/billing-policy"

import { absoluteUrl } from "./content"

/** Shared SEO landing pages. Copy must match real product behavior. */
export type MarketingFaq = readonly [question: string, answer: string]

export type MarketingUseCase = {
  title: string
  body: string
  href: string
}

export type MarketingPage = {
  path: string
  title: string
  description: string
  h1: string
  lead: string
  sections: {
    id: string
    title: string
    body?: string
    bullets?: readonly string[]
    cards?: readonly { title: string; body: string }[]
    links?: readonly { label: string; href: string }[]
  }[]
  useCases?: readonly MarketingUseCase[]
  faqs: readonly MarketingFaq[]
  related: readonly { label: string; href: string; description: string }[]
}

export const aiAgentsForBusinessPage: MarketingPage = {
  path: "/ai-agents-for-business",
  title: "AI agents for business",
  description:
    "AI agents for business that use your apps, a shared cloud computer, and memory. Small-business automation and a virtual assistant that waits for your approval before writes.",
  h1: "AI agents for business",
  lead:
    "Krafty Bot gives you AI teammates that finish work in Gmail, Slack, Sheets, and the browser—not just chat replies. Each Bot keeps its own memory, your account shares one persistent cloud computer, and routines run on a schedule while you run the business.",
  sections: [
    {
      id: "small-business",
      title: "AI automation for small business",
      body:
        "You describe the job in plain language. The Bot connects the apps you already use, works in a real desktop browser when there is no integration, and reports back in chat. Expense logging, inbox triage, and weekly summaries are common first routines on a small team.",
    },
    {
      id: "virtual-assistant",
      title: "AI virtual assistant for small business",
      body:
        "A Bot can read unread mail and Slack, draft replies in your voice, and brief you before meetings from your calendar and past threads. It does not send mail or post messages until you approve those app writes, unless you have chosen to always allow a specific action for that Bot.",
    },
    {
      id: "how-krafty-fits",
      title: "What you get on Krafty Bot",
      bullets: [
        "Per-Bot memory separate from chat history",
        "One shared cloud computer per account with a desktop and browser",
        "Connected apps such as Gmail, Google Sheets, Slack, and Notion",
        "Routines on a daily, hourly, or one-time schedule in your timezone",
        "Group chats when several Bots should hand work off to each other",
        "Approvals before connected-app writes and before risky computer steps",
      ],
    },
    {
      id: "start",
      title: "Start with one job",
      body:
        "Create a Bot, connect the apps the first task needs, and ask it to repeat the work on a schedule when it goes well. The free plan includes one Bot and one connected app so you can try a single workflow before upgrading.",
      links: [
        { label: "How Krafty Bot works", href: "/how-it-works" },
        { label: "Copy a starter prompt", href: "/use-cases" },
        { label: "Autonomous AI agents explained", href: "/autonomous-ai-agent" },
      ],
    },
  ],
  useCases: [
    {
      title: "Receipts and expenses",
      body:
        "Pull receipts from Gmail, file PDFs in Drive, and log rows in a sheet every Friday.",
      href: "/use-cases/expense-manager",
    },
    {
      title: "Support triage",
      body:
        "Read new tickets, draft answers from your help center, and flag bugs with links to your tracker.",
      href: "/use-cases/support-triage",
    },
    {
      title: "Morning brief",
      body:
        "Summarize mail, DMs, and today's calendar with draft replies waiting in Gmail.",
      href: "/use-cases/chief-of-staff",
    },
    {
      title: "Paid media reporting",
      body:
        "Post yesterday's spend and results to Slack and recommend budget moves without changing bids until you agree.",
      href: "/use-cases/paid-media",
    },
  ],
  faqs: [
    [
      "What are AI agents for business on Krafty Bot?",
      "They are Bots you configure with a role and instructions. Each Bot uses connected apps and a shared cloud computer to do multi-step work, save memory, and run routines on a schedule.",
    ],
    [
      "Is this AI automation for small business without a developer?",
      "Yes. You describe tasks in chat, connect apps through sign-in, and approve writes. There is no separate builder or code to deploy.",
    ],
    [
      "How is this different from a chatbot?",
      "A Bot keeps working after you close the browser, uses your tools directly, and can run on a schedule. Chat history is not the same as the memory you ask it to save.",
    ],
    [
      "What does the virtual assistant not do on its own?",
      "It does not send email, post to Slack, or change records in connected apps without your approval, unless you have set an always-allow rule for that Bot and action.",
    ],
  ],
  related: [
    {
      label: "AI employees and AI workers",
      href: "/ai-employees",
      description: "How teammates with memory and a computer map to employee-style roles.",
    },
    {
      label: "Manus alternatives",
      href: "/manus-alternatives",
      description: "What to look for in an autonomous agent workspace.",
    },
  ],
}

export const aiEmployeesPage: MarketingPage = {
  path: "/ai-employees",
  title: "AI employees and AI workers",
  description:
    "AI employees and AI workers that use memory, connected apps, and a shared cloud computer. Give each Bot a role, run routines, and approve changes before they ship.",
  h1: "AI employees and AI workers",
  lead:
    "People search for AI employees or AI workers when they want agents that own ongoing work—not a single prompt. On Krafty Bot, each Bot is a teammate with its own memory and instructions, and every Bot on your account shares one persistent cloud computer for browser and desktop tasks.",
  sections: [
    {
      id: "employees-vs-workers",
      title: "AI employees vs. AI workers",
      body:
        "Both phrases usually mean software agents that carry tasks across sessions. Krafty does not employ people or replace payroll roles; it gives you Bots you name, instruct, and supervise. You choose what each Bot may do in your apps and on the computer.",
    },
    {
      id: "roles",
      title: "Give each Bot a job title",
      cards: [
        {
          title: "Outbound research",
          body:
            "A sales Bot can research accounts overnight and leave drafts in your inbox for review.",
        },
        {
          title: "Operations",
          body:
            "An ops Bot can reconcile expenses, update sheets, and ping your team on Slack on a routine.",
        },
        {
          title: "Support",
          body:
            "A support Bot can triage tickets, draft replies from your docs, and file bugs with repro steps.",
        },
        {
          title: "Team handoffs",
          body:
            "Several Bots in one group chat can pass work between themselves when a job spans roles.",
        },
      ],
    },
    {
      id: "supervision",
      title: "You stay in charge",
      bullets: [
        "Connected-app reads do not need approval; writes wait unless you always allow them",
        "High-risk app actions cannot be set to always allow",
        "Risky clicks and keys on the cloud computer are checked against a screenshot",
        "Approval requests expire after seven days",
      ],
    },
    {
      id: "explore",
      title: "See it in practice",
      links: [
        { label: "AI agents for business", href: "/ai-agents-for-business" },
        { label: "Use cases with starter prompts", href: "/use-cases" },
        { label: "How approvals work", href: "/how-it-works#approvals" },
      ],
    },
  ],
  faqs: [
    [
      "Are Krafty Bots actual employees?",
      "No. They are AI agents you configure. You approve app writes and risky computer steps, and you can disconnect apps or delete Bots at any time.",
    ],
    [
      "Can AI workers run while I am offline?",
      "Yes. Routines post work into a chat on a schedule, and the Bot can keep using the cloud computer until a step needs your approval or a plan limit applies.",
    ],
    [
      "Do AI employees share one computer?",
      "Yes. Each account has one persistent cloud computer shared by all its Bots. Files and browser sign-ins carry over between Bots.",
    ],
    [
      "How many AI workers can I have?",
      `The free plan includes one Bot. Pro includes up to ${planLimits.paid.bots} Bots; see pricing on the homepage for allowances.`,
    ],
  ],
  related: [
    {
      label: "AI agents for business",
      href: "/ai-agents-for-business",
      description: "Automation and virtual-assistant workflows for small teams.",
    },
    {
      label: "Autonomous AI agent",
      href: "/autonomous-ai-agent",
      description: "What autonomy means on Krafty Bot.",
    },
  ],
}

export const manusAlternativesPage: MarketingPage = {
  path: "/manus-alternatives",
  title: "Manus alternatives",
  description:
    "Considering Manus alternatives? See how Krafty Bot handles autonomous work with memory, a shared cloud computer, connected apps, routines, and human approvals—without speaking for other products.",
  h1: "Manus alternatives",
  lead:
    "Manus is a third-party product—we are not affiliated with it and cannot verify its features, pricing, or roadmap. If you are comparing Manus alternatives, this page explains what Krafty Bot offers so you can judge fit against whatever you need from any vendor.",
  sections: [
    {
      id: "what-to-compare",
      title: "What to compare across tools",
      bullets: [
        "Whether agents can use your existing accounts in apps and in a browser",
        "Whether work continues on a schedule or only while a chat is open",
        "How the product stores context between sessions",
        "What requires human approval before money, mail, or data changes",
        "How pricing maps to computer time, model usage, and seats",
      ],
    },
    {
      id: "krafty",
      title: "What Krafty Bot provides",
      cards: [
        {
          title: "Teammates with memory",
          body:
            "Each Bot saves notes you ask for and recalls them in any chat; memory is separate from transcript history.",
        },
        {
          title: "Shared cloud computer",
          body:
            "One desktop and browser per account, shared by all Bots, with files and sign-ins that persist between sessions.",
        },
        {
          title: "Connected apps",
          body:
            "Bots use apps you connect—Gmail, Sheets, Slack, Notion, and others—and fall back to the computer browser when needed.",
        },
        {
          title: "Routines",
          body:
            "Turn a finished job into a routine that runs daily, every few hours, or once at a set time.",
        },
        {
          title: "Approvals",
          body:
            "Writes to connected apps and committing computer steps wait for you unless you have allowed a specific action for that Bot.",
        },
      ],
    },
    {
      id: "honest",
      title: "What we will not claim",
      body:
        "We do not publish side-by-side scores against Manus or other vendors, and we do not quote their pricing or benchmarks. Third-party review sites may be outdated. Try Krafty on the free plan with a throwaway workflow if you want firsthand behavior.",
      links: [
        { label: "AI agents for business", href: "/ai-agents-for-business" },
        { label: "How it works", href: "/how-it-works" },
      ],
    },
  ],
  faqs: [
    [
      "Is Krafty Bot a Manus replacement?",
      "It may be, depending on what you need. Krafty focuses on teammates with memory, a shared cloud computer, connected apps, routines, and approvals. Only you can decide if that matches the jobs you gave another tool.",
    ],
    [
      "Does Krafty Bot run autonomous tasks?",
      "Bots can run routines and continue turns on the cloud computer, but connected-app writes and risky computer actions wait for your approval unless you configure always-allow rules where permitted.",
    ],
    [
      "Can I use my own app accounts?",
      "Yes. You connect each app yourself and can disconnect at any time. Bots do not receive your passwords in chat.",
    ],
  ],
  related: [
    {
      label: "Autonomous AI agent explained",
      href: "/autonomous-ai-agent",
      description: "Definitions and how Krafty handles unattended work.",
    },
    {
      label: "AI employees",
      href: "/ai-employees",
      description: "Role-based Bots with supervision built in.",
    },
  ],
}

export const autonomousAiAgentPage: MarketingPage = {
  path: "/autonomous-ai-agent",
  title: "Autonomous AI agent",
  description:
    "What is an autonomous AI agent? How Krafty Bot runs scheduled routines, continues work on a cloud computer, and still asks before writes—plus links to business and employee-style setups.",
  h1: "Autonomous AI agent",
  lead:
    "An autonomous AI agent is software that takes multi-step actions toward a goal without you typing every instruction at each step. On Krafty Bot, autonomy shows up as routines, unattended chat turns, and work on a shared cloud computer—with approvals before changes to your apps or risky clicks.",
  sections: [
    {
      id: "definition",
      title: "What people mean by autonomous",
      body:
        "Usually: the agent plans steps, uses tools, and keeps going for a while without live chat. It does not mean unlimited freedom. Krafty Bots still hit plan usage limits, step caps, and approval gates described in the product docs.",
    },
    {
      id: "builder",
      title: "AI agent builder vs. describing a job",
      body:
        "Many products ship a visual builder or SDK. Krafty Bot is closer to hiring a teammate: you create a Bot, answer setup questions, and describe work in plain language. There is no separate canvas to wire nodes, though you can save a successful job as a routine.",
      links: [
        { label: "AI agents for business", href: "/ai-agents-for-business" },
        { label: "Manus alternatives", href: "/manus-alternatives" },
      ],
    },
    {
      id: "on-krafty",
      title: "How autonomy works on Krafty Bot",
      bullets: [
        "Routines post a prompt into a chat on a schedule you choose",
        "Bots use connected apps and the shared cloud computer during a turn",
        "Unattended turns are labeled in the transcript so you can see what started them",
        "Continuations resume a capped turn without gaining new permissions",
        "Approvals wake the Bot when you decide on a held action",
      ],
    },
  ],
  faqs: [
    [
      "Is Krafty Bot fully autonomous?",
      "No. It is built to keep working in the background, but writes to connected apps and committing computer steps require your approval unless you have allowed a specific action for that Bot.",
    ],
    [
      "What is an AI agent builder in this context?",
      "Often a tool to compose tools and prompts visually. Krafty Bot instead uses chat instructions, per-Bot memory, and routines created from jobs that already worked.",
    ],
    [
      "Where should I start?",
      "Pick a concrete job—expenses, triage, or a morning brief—on the business page or use-case library, then promote it to a routine when the Bot succeeds.",
    ],
  ],
  related: [
    {
      label: "AI agents for business",
      href: "/ai-agents-for-business",
      description: "Commercial workflows for small teams.",
    },
    {
      label: "AI employees and AI workers",
      href: "/ai-employees",
      description: "Role-based teammates with shared infrastructure.",
    },
  ],
}

export const marketingSeoPages = [
  aiAgentsForBusinessPage,
  aiEmployeesPage,
  manusAlternativesPage,
  autonomousAiAgentPage,
] as const

export function marketingPageUrl(path: string) {
  return absoluteUrl(path)
}
