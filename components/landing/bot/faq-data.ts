import { planLimits } from "@/lib/billing-policy"

// Shared by the FAQ accordion and the homepage FAQPage structured data.
export const faqs = [
  [
    "How is Krafty Bot different from AI assistants?",
    "Bots have their own computer, so they can work inside your apps and tools. They also run in parallel, even when your browser is closed.",
  ],
  [
    "Who is Krafty Bot available for today?",
    "Anyone can start free with one bot, one connected app, and a one-time $1 AI allowance. More teammates and cloud computers require a paid plan. See the available plans in your workspace.",
  ],
  [
    "Where do I talk to Krafty Bot?",
    "Open Krafty in your browser on your desktop or phone. Your workspace brings individual chats, group conversations, and your teammates together.",
  ],
  [
    "How much does Krafty Bot cost?",
    `Krafty is free to start with one bot. Pro is $20 per month for up to ${planLimits.paid.bots} bots, unlimited connected apps, a $${planLimits.paid.ai / 1_000_000} AI allowance, and ${planLimits.paid.sandbox / 3600} hours of cloud computer time each billing period. Your usage page tracks both for the current period.`,
  ],
  [
    "Do Bots share one computer?",
    "Each Krafty Bot has its own persistent cloud computer. Its files, memory, and applications survive when the computer pauses. Bots can collaborate through shared conversations and handoffs.",
  ],
  [
    "Can Bots keep working when I close my browser?",
    "Active chat tasks run independently of your browser. Computers pause when idle and resume when needed. Tasks are subject to your usage allowance, step limits, and provider availability.",
  ],
  [
    "Do Bots remember everything?",
    "Bots can save notes to their memory and recall them across chats. Ask them to remember what matters. Saved memory is separate from conversation history; every message is not automatically remembered.",
  ],
] as const
