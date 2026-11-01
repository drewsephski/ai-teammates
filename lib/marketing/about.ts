import type { MarketingPage } from "./seo-pages"

// Who builds Krafty and how the public pages are checked. State only facts
// about the company and the process; no invented team, customers or press.
export const aboutPage: MarketingPage = {
  path: "/about",
  title: "About Krafty: who builds it and how",
  description:
    "Krafty is built independently by Drew Sepeczi in Chicago. Who is behind Krafty Bot, how its pages are checked against the code, and how to reach us.",
  summary:
    "Who builds Krafty Bot, how the public pages are checked, and how to get in touch.",
  h1: "About Krafty",
  lead: "Krafty is an independent company in Chicago, Illinois. Its product, Krafty Bot, is an AI workspace where you hand tasks to Bots that work in your apps and on a cloud computer. Drew Sepeczi builds and runs it, and writes the guides on this site.",
  sections: [
    {
      id: "who",
      title: "Who builds Krafty?",
      body: "Drew Sepeczi, an independent developer based in Chicago, designs, builds, and supports Krafty Bot on the web and in the mobile app. Support email goes to Drew directly.",
      links: [
        {
          label: "Drew on LinkedIn",
          href: "https://www.linkedin.com/in/drewsepeczi/",
        },
        { label: "Drew on GitHub", href: "https://github.com/drewsephski" },
        {
          label: "Krafty on LinkedIn",
          href: "https://www.linkedin.com/company/kraftybot/",
        },
      ],
    },
    {
      id: "why",
      title: "Why Krafty exists",
      body: "Chat assistants answer while you watch and forget when the tab closes. Workflow tools run only the steps you wired up ahead of time. Krafty is for the work in between: a job you can describe in a sentence, that lives in the apps you already use, and that you want done and checked rather than explained.",
    },
    {
      id: "claims",
      title: "How product claims on this site are checked",
      body: "Prices, plan limits, and safeguards on these pages are generated from the same code that enforces them, so they can't drift from the product. Descriptions of how approvals work follow the rules the app actually runs. Pages say what Krafty can't do as plainly as what it can.",
      bullets: [
        "No invented customers, testimonials, usage numbers, or results.",
        "Walkthroughs describe a workflow to try, not a recorded customer run.",
        "Each guide shows the date it was last updated.",
      ],
    },
    {
      id: "comparisons",
      title: "How comparisons are written",
      body: "When a page describes another product, the description comes from that product's own website or documentation, read on a stated date, with a link to the source. We don't score other products, run benchmarks, or quote their prices. Krafty Bot appears on its own comparison pages, so read them knowing who wrote them, and tell us if something about another product is out of date.",
      links: [
        {
          label: "Best AI agents for small business",
          href: "/best-ai-agents-small-business",
        },
        { label: "Grok Bot alternatives", href: "/grokbot-alternatives" },
      ],
    },
    {
      id: "contact",
      title: "How to reach us",
      body: "Email drewsepeczi@gmail.com for help, corrections, partnership questions, or press. The support page has what to include when you report a problem.",
      links: [{ label: "Support", href: "/support" }],
    },
  ],
  faqs: [
    [
      "Is Krafty affiliated with xAI, OpenAI, or Manus?",
      "No. Krafty is independent. Pages that mention Grok Bot, ChatGPT agent, Manus, or other products describe them from their own sites.",
    ],
    ["Where is Krafty based?", "Chicago, Illinois, in the United States."],
    [
      "Who answers support email?",
      "Drew Sepeczi, who builds Krafty, reads and answers support email.",
    ],
    [
      "How do I report a mistake on this site?",
      "Email drewsepeczi@gmail.com with the page and what's wrong. Corrections about other products are made once they can be checked on that product's own site.",
    ],
  ],
  related: [
    {
      label: "How Krafty Bot works",
      href: "/how-it-works",
      description:
        "Memory, the shared cloud computer, connected apps, routines, and approvals.",
    },
    {
      label: "Human approval for AI agents",
      href: "/ai-agent-human-approval",
      description: "What waits for you before a Bot acts.",
    },
    {
      label: "Support",
      href: "/support",
      description: "Help with your account, Bots, and conversations.",
    },
  ],
}
