import { planLimits } from "@/lib/billing-policy"
import { WORK_WEEKS_PER_YEAR } from "@/lib/time-cost"

import type { MarketingPage } from "./seo-pages"

// A free tool page other sites can link to. The calculator itself is
// components/landing/bot/time-cost-calculator.tsx over lib/time-cost.ts.
export const timeCostCalculatorPage: MarketingPage = {
  path: "/time-cost-calculator",
  title: "Time cost calculator for repetitive tasks",
  description:
    "Free calculator: add your repetitive tasks and see the hours and money they take each week and year. No sign-up, nothing stored, and the formula is shown.",
  summary:
    "A free calculator for the hours and money your repetitive tasks take each week and year.",
  h1: "Time cost calculator for repetitive tasks",
  lead: "List the tasks you repeat every week, how long each takes, and what an hour of your time is worth. The calculator shows what they cost you in hours, workdays, and dollars a year, so you can decide which ones to hand off first. It runs in your browser; nothing you type is sent or saved.",
  widget: "time-cost-calculator",
  sections: [
    {
      id: "formula",
      title: "How the calculation works",
      body: `Weekly minutes are each task's minutes multiplied by how many times a week it happens, added up across tasks. Yearly hours are weekly minutes divided by 60, times ${WORK_WEEKS_PER_YEAR} working weeks, which allows for holidays and time off. Yearly cost is yearly hours times your hourly value. Workdays are yearly hours divided by eight.`,
      bullets: [
        "Example: email triage at 30 minutes, five times a week, is 150 minutes a week.",
        `That is 2.5 hours a week, or ${2.5 * WORK_WEEKS_PER_YEAR} hours a year.`,
        `At $50 an hour, it costs $${(2.5 * WORK_WEEKS_PER_YEAR * 50).toLocaleString("en-US")} a year, or ${(2.5 * WORK_WEEKS_PER_YEAR) / 8} eight-hour workdays.`,
      ],
    },
    {
      id: "hourly-value",
      title: "What hourly value should you use?",
      body: "Use what an hour of your time earns or would cost to replace. A freelancer can use their billable rate. An employee can use salary divided by about 2,000 working hours, plus roughly a quarter for benefits and overhead. A founder can use what they would pay someone to do the task, or the rate their most valuable work earns.",
    },
    {
      id: "which-first",
      title: "Which tasks to hand off first",
      body: "Sort by yearly hours, then pick the task that is both expensive and easy to check. Good first candidates repeat on a schedule, live in one or two apps, and have a clear finish line.",
      bullets: [
        "Email triage and reply drafts, checked before anything is sent.",
        "A morning brief from your inbox, messages, and calendar.",
        "Receipts pulled from email and logged in a spreadsheet.",
        "Weekly reports copied from one tool into another.",
      ],
      links: [
        {
          label: "AI agents for small business",
          href: "/ai-agents-for-business",
        },
        { label: "AI personal assistant", href: "/ai-personal-assistant" },
      ],
    },
    {
      id: "limits",
      title: "What the number doesn't include",
      body: "The result is the time the tasks take you today, not a promise of savings. Handing a task to a person or an AI agent still takes time to describe the job and review the work, and some tasks need your judgment every time. Context switching around small tasks often costs more than the minutes themselves, and the calculator doesn't count that.",
    },
    {
      id: "link",
      title: "Use this calculator on your site",
      body: "You're welcome to link to this calculator from a guide, a newsletter, or a resource list. Copy the link HTML under the calculator. The page stays at this address.",
    },
  ],
  faqs: [
    [
      "Is this time cost calculator free?",
      "Yes. There's no sign-up, and it runs entirely in your browser. Nothing you enter is sent to a server or stored.",
    ],
    [
      "Why 48 weeks a year?",
      `${WORK_WEEKS_PER_YEAR} weeks allows for about four weeks of holidays and time off. If you work every week, the yearly figures are about 8% higher.`,
    ],
    [
      "How do I find how long a task takes?",
      "Time it for one week. Start a timer each time you do it and write down the minutes. Estimates from memory usually run low for small, frequent tasks.",
    ],
    [
      "Can an AI agent take these tasks off my plate?",
      `Some of them. An agent such as Krafty Bot can do repetitive work in your apps and on a schedule, while you still describe the job and approve anything it sends or changes. Krafty's free plan includes one Bot; Pro is $20 a month for up to ${planLimits.paid.bots} Bots.`,
    ],
  ],
  related: [
    {
      label: "Best AI agents for small business",
      href: "/best-ai-agents-small-business",
      description: "Eight agents compared on the same five questions.",
    },
    {
      label: "Use cases",
      href: "/use-cases",
      description: "Jobs people give a Bot, each with a starter prompt.",
    },
    {
      label: "How Krafty Bot works",
      href: "/how-it-works",
      description:
        "Memory, the shared cloud computer, connected apps, routines, and approvals.",
    },
  ],
}
