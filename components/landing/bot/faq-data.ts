import { planLimits } from "@/lib/billing-policy"
import { definition } from "@/lib/marketing/content"
import { freePlanIncludes } from "@/lib/marketing/site"

// Shared by the FAQ accordion and the homepage FAQPage structured data.
export const faqs = [
  ["What is Krafty Bot?", definition],
  [
    "How is Krafty Bot different from a chat assistant?",
    "Krafty is built around doing the task instead of explaining it. Bots work in the apps you connect and on a cloud computer with a browser, several can run at once, and they keep going after you close your browser.",
  ],
  [
    "Does a Bot change things in my apps without asking?",
    "No. Reading your connected apps needs no approval, but anything that writes to them, such as sending an email or updating a record, waits for you to approve it. You can choose to always allow a specific action for a specific Bot, except for high-risk actions.",
  ],
  [
    "Who is Krafty Bot for?",
    `Anyone with work they keep putting off: independent founders, freelancers, developers, and small businesses. Start free with ${freePlanIncludes}. More Bots and hours of computer time need a paid plan.`,
  ],
  [
    "Where do I talk to Krafty Bot?",
    "In your browser, on your laptop or your phone. Your workspace has a chat with each Bot, group chats, and an Activity page for anything waiting on you.",
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
