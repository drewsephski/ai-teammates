import { planLimits } from "@/lib/billing-policy"

// Shared by the FAQ accordion and the homepage FAQPage structured data.
export const faqs = [
  [
    "How is Krafty Bot different from AI assistants?",
    "Bots have a cloud computer, so they work inside your apps and tools instead of only answering questions. Several can run at once, and they keep going after you close your browser.",
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
    "Yes. All the Bots on your account share one persistent cloud computer, so files and browser sign-ins carry over from one Bot to the next. Its files and applications survive when the computer pauses. Bots also work together through group conversations and handoffs.",
  ],
  [
    "Can Bots keep working when I close my browser?",
    "Yes. A chat task keeps running after you close the tab. The computer pauses when idle and resumes when a Bot needs it. A task can still stop early if you reach your usage allowance or step limit, or if a provider is down.",
  ],
  [
    "Do Bots remember everything?",
    "Not automatically. Bots save notes to their memory and can recall them in any chat, so tell them what is worth remembering. Memory is separate from chat history.",
  ],
] as const
