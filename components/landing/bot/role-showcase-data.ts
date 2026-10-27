import type { CSSProperties } from "react"

// Homepage examples of jobs people hand a Bot. The /use-cases pages keep their
// own list in app/use-cases/use-cases-data.ts.
export const roles = [
  {
    id: "inbox",
    name: "Inbox",
    color: "#54b9a6",
    bubble: "#01b6c3",
    pill: "#4ad8ec",
    pillBackground: "#012f35",
    description:
      "Answer what actually needs you. Finds the emails that need a reply, drafts answers in your voice, and holds every send until you approve it.",
  },
  {
    id: "client-finder",
    name: "Client Finder",
    color: "#885cf5",
    bubble: "#8f8deb",
    pill: "#b6b3f9",
    pillBackground: "#251f41",
    description:
      "Find people who could use your work. Researches businesses that fit what you offer, skips anyone you’ve already contacted, and drafts a short intro for each.",
  },
  {
    id: "release-check",
    name: "Release Check",
    color: "#ea4045",
    bubble: "#fd5c6a",
    pill: "#ff99a8",
    pillBackground: "#4e071c",
    description:
      "Know what’s blocking the next release. Reads your open GitHub issues and pull requests, then tells you what to fix first and what can wait.",
  },
  {
    id: "morning-rundown",
    name: "Morning Rundown",
    color: "#ed712e",
    bubble: "#fe733d",
    pill: "#ffa782",
    pillBackground: "#481800",
    description:
      "Start the day with what matters. Checks your calendar and inbox every morning and sends a short rundown of what actually needs your attention.",
  },
  {
    id: "research",
    name: "Research",
    color: "#3c82f6",
    bubble: "#2da0f5",
    pill: "#7fc3ff",
    pillBackground: "#002843",
    description:
      "Get an answer instead of twenty tabs. Searches the web, reads the sources, and brings back a short comparison with links.",
  },
  {
    id: "friday-recap",
    name: "Friday Recap",
    color: "#eb4699",
    bubble: "#e76cb8",
    pill: "#f6a0d5",
    pillBackground: "#480c34",
    description:
      "End the week with a plan. Every Friday it sums up what changed across your apps and what you should work on next.",
  },
  {
    id: "invoices",
    name: "Invoices",
    color: "#5bc67a",
    bubble: "#2cb663",
    pill: "#6dd998",
    pillBackground: "#012f12",
    description:
      "Get paid without chasing. Checks Stripe for overdue invoices every week, drafts friendly reminders, and waits for your OK before any go out.",
  },
]

export type BotRole = (typeof roles)[number]

export function roleStyle(role: BotRole): CSSProperties {
  return {
    "--role-color": role.color,
    "--role-bubble": role.bubble,
    "--role-pill": role.pill,
    "--role-pill-background": role.pillBackground,
  } as CSSProperties
}

// Fictional example chats, one per role. Times are offsets from the demo clock.
export type RoleEntry =
  | {
      kind: "message"
      id: string
      role: "user"
      content: string
      timestampMs: number
    }
  | {
      kind: "send-message"
      id: string
      timestampMs: number
      message: { type: "text"; content: string }
    }
  | {
      kind: "system"
      id: string
      timestampMs: number
      event:
        | { type: "created-routine"; name: string; triggerDescription: string }
        | { type: "shared-context"; source: { name: string }; summary: string }
    }
  | {
      kind: "computer-use"
      id: string
      timestampMs: number
      instruction: string
      ask: string
      status: "done"
    }
  | {
      kind: "outbound-message"
      id: string
      timestampMs: number
      channel: "email" | "slack"
      from?: string
      workspace?: string
      to: string
      subject?: string
      thread?: string
      body: string[]
      status: "ready" | "sent"
    }

export const roleScenarios: Record<
  string,
  {
    name: string
    lastMessage: string
    lastActivityAt: number
    isPinned: boolean
    hasUnread: boolean
    unreadCount: number
    isRunning: boolean
    transcript: RoleEntry[]
  }
> = {
  inbox: {
    name: "Inbox",
    lastMessage: "Sent to Leo. The other three drafts are waiting here.",
    lastActivityAt: -1740000,
    isPinned: true,
    hasUnread: false,
    unreadCount: 0,
    isRunning: false,
    transcript: [
      {
        kind: "message",
        id: "inbox-1",
        role: "user",
        content:
          "check my email, find anything i need to respond to, and draft the replies. don't send anything yet.",
        timestampMs: -7200000,
      },
      {
        kind: "send-message",
        id: "inbox-2",
        timestampMs: -6900000,
        message: {
          type: "text",
          content:
            "Went through 46 emails since yesterday. **4 need a reply from you.** The rest are receipts, newsletters, and threads you’re only cc’d on.",
        },
      },
      {
        kind: "send-message",
        id: "inbox-3",
        timestampMs: -6840000,
        message: {
          type: "text",
          content:
            "Leo’s matters most. He wants to know if the site can launch a week early. The draft offers a soft launch on the 20th and keeps the full launch on the 27th.",
        },
      },
      {
        kind: "outbound-message",
        id: "inbox-4",
        timestampMs: -6780000,
        channel: "email",
        from: "drew@kraftybot.app",
        to: "leo@harborcoffee.example",
        subject: "Re: Launch date",
        body: [
          "Hi Leo,",
          "We can do a soft launch on the 20th so you can share it with your regulars. The full launch, with online ordering, stays on the 27th.",
          "Does that work for you?",
          "Drew",
        ],
        status: "ready",
      },
      {
        kind: "message",
        id: "inbox-5",
        role: "user",
        content: "send leo's. i'll look at the other three tonight",
        timestampMs: -1800000,
      },
      {
        kind: "send-message",
        id: "inbox-6",
        timestampMs: -1740000,
        message: {
          type: "text",
          content: "Sent to Leo. The other three drafts are waiting here.",
        },
      },
    ],
  },
  "client-finder": {
    name: "Prospects",
    lastMessage: "Sent the first five. The other five are saved here.",
    lastActivityAt: -3540000,
    isPinned: true,
    hasUnread: false,
    unreadCount: 0,
    isRunning: false,
    transcript: [
      {
        kind: "message",
        id: "client-finder-1",
        role: "user",
        content:
          "find 10 local businesses that could use a better website. check my hubspot so we don't double up, and write a short intro for each. don't send anything.",
        timestampMs: -259200000,
      },
      {
        kind: "computer-use",
        id: "client-finder-2",
        timestampMs: -258600000,
        instruction:
          "Sign in to HubSpot on my computer so I can see who you’ve already contacted.",
        ask: "Sign in to HubSpot",
        status: "done",
      },
      {
        kind: "send-message",
        id: "client-finder-3",
        timestampMs: -255600000,
        message: {
          type: "text",
          content:
            "Checked 34 businesses within 20 miles. **10 made the list**: slow sites, broken mobile layouts, or no online booking. 5 were already in your HubSpot, so I skipped them.",
        },
      },
      {
        kind: "send-message",
        id: "client-finder-4",
        timestampMs: -255540000,
        message: {
          type: "text",
          content:
            "Best fit is **Northside Physio**. Their booking form doesn’t submit on phones, and three recent reviews mention it.",
        },
      },
      {
        kind: "outbound-message",
        id: "client-finder-5",
        timestampMs: -255480000,
        channel: "email",
        from: "drew@kraftybot.app",
        to: "hello@northsidephysio.example",
        subject: "Your booking form on mobile",
        body: [
          "Hi there,",
          "Your booking form doesn’t submit on phones, and a few of your recent reviews mention it.",
          "I build websites for local businesses and could fix it this week. Want me to send over a quick plan?",
          "Drew",
        ],
        status: "ready",
      },
      {
        kind: "message",
        id: "client-finder-6",
        role: "user",
        content: "these are good. send the first five",
        timestampMs: -3600000,
      },
      {
        kind: "send-message",
        id: "client-finder-7",
        timestampMs: -3540000,
        message: {
          type: "text",
          content: "Sent the first five. The other five are saved here.",
        },
      },
    ],
  },
  "release-check": {
    name: "Releases",
    lastMessage: "Moved 4 issues to v1.5. Looking at the migration test now.",
    lastActivityAt: -25140000,
    isPinned: false,
    hasUnread: true,
    unreadCount: 1,
    isRunning: true,
    transcript: [
      {
        kind: "message",
        id: "release-check-1",
        role: "user",
        content:
          "look through my open github issues and tell me what's blocking the next release",
        timestampMs: -28800000,
      },
      {
        kind: "send-message",
        id: "release-check-2",
        timestampMs: -28500000,
        message: {
          type: "text",
          content:
            "v1.4 has **9 open issues**. Two actually block it: a login redirect loop in Safari and a failing migration test. Three PRs are in review, and four issues are nice-to-haves with no PR.",
        },
      },
      {
        kind: "send-message",
        id: "release-check-3",
        timestampMs: -28440000,
        message: {
          type: "text",
          content:
            "The Safari loop started after last week’s auth upgrade and has 3 duplicate reports. I’d fix that first and move the four nice-to-haves to v1.5.",
        },
      },
      {
        kind: "message",
        id: "release-check-4",
        role: "user",
        content: "move them, then figure out the migration test",
        timestampMs: -25200000,
      },
      {
        kind: "send-message",
        id: "release-check-5",
        timestampMs: -25140000,
        message: {
          type: "text",
          content: "Moved 4 issues to v1.5. Looking at the migration test now.",
        },
      },
    ],
  },
  "morning-rundown": {
    name: "Rundown",
    lastMessage: "Sent. If they reply, it’ll be in tomorrow’s rundown.",
    lastActivityAt: -15840000,
    isPinned: true,
    hasUnread: false,
    unreadCount: 0,
    isRunning: false,
    transcript: [
      {
        kind: "system",
        id: "rundown-1",
        timestampMs: -604800000,
        event: {
          type: "created-routine",
          name: "Morning rundown",
          triggerDescription: "Weekdays at 8:00 AM",
        },
      },
      {
        kind: "send-message",
        id: "rundown-2",
        timestampMs: -18480000,
        message: {
          type: "text",
          content:
            "Morning. **3 things need you today**: the 2 PM client call (Priya sent new notes), Leo’s contract waiting for your signature, and a dentist appointment that overlaps the call.",
        },
      },
      {
        kind: "send-message",
        id: "rundown-3",
        timestampMs: -18420000,
        message: {
          type: "text",
          content:
            "Everything else can wait: 21 newsletters, 6 receipts, and a shipping update.",
        },
      },
      {
        kind: "message",
        id: "rundown-4",
        role: "user",
        content: "ask the dentist to move me to thursday",
        timestampMs: -16200000,
      },
      {
        kind: "outbound-message",
        id: "rundown-5",
        timestampMs: -16140000,
        channel: "email",
        from: "drew@kraftybot.app",
        to: "appointments@brightsmile.example",
        subject: "Moving today’s 2 PM appointment",
        body: [
          "Hi,",
          "Something came up at 2 PM today. Do you have anything Thursday afternoon instead?",
          "Thanks,",
          "Drew",
        ],
        status: "ready",
      },
      {
        kind: "message",
        id: "rundown-6",
        role: "user",
        content: "send it",
        timestampMs: -15900000,
      },
      {
        kind: "send-message",
        id: "rundown-7",
        timestampMs: -15840000,
        message: {
          type: "text",
          content: "Sent. If they reply, it’ll be in tomorrow’s rundown.",
        },
      },
    ],
  },
  research: {
    name: "Research",
    lastMessage: "3 rows are in Purchases with prices, specs, and links.",
    lastActivityAt: -8640000,
    isPinned: false,
    hasUnread: true,
    unreadCount: 2,
    isRunning: false,
    transcript: [
      {
        kind: "message",
        id: "research-1",
        role: "user",
        content:
          "i need a laptop for dev work under $2,000. compare the real options, not the sponsored lists",
        timestampMs: -10800000,
      },
      {
        kind: "send-message",
        id: "research-2",
        timestampMs: -10200000,
        message: {
          type: "text",
          content:
            "Read 14 reviews and 5 store pages. **3 laptops** fit your budget and are in stock. Two others slow down during long builds, so I ruled them out.",
        },
      },
      {
        kind: "send-message",
        id: "research-3",
        timestampMs: -10140000,
        message: {
          type: "text",
          content:
            "The pick is the 14-inch with 32 GB of memory, about $1,800. The cheaper one only has 16 GB, which gets tight with Docker running. Every source is linked in the comparison.",
        },
      },
      {
        kind: "message",
        id: "research-4",
        role: "user",
        content: "add them to my purchases sheet",
        timestampMs: -9000000,
      },
      {
        kind: "send-message",
        id: "research-5",
        timestampMs: -8640000,
        message: {
          type: "text",
          content:
            "You approved the sheet update. 3 rows are in Purchases with prices, specs, and links.",
        },
      },
    ],
  },
  "friday-recap": {
    name: "Recap",
    lastMessage: "Set. I’ll bring up Leo’s quote Monday at 9.",
    lastActivityAt: -333840000,
    isPinned: false,
    hasUnread: false,
    unreadCount: 0,
    isRunning: false,
    transcript: [
      {
        kind: "message",
        id: "recap-1",
        role: "user",
        content:
          "every friday, summarize what changed this week and what i should work on next",
        timestampMs: -1209600000,
      },
      {
        kind: "system",
        id: "recap-2",
        timestampMs: -1209600000,
        event: {
          type: "created-routine",
          name: "Friday recap",
          triggerDescription: "Fridays at 4:00 PM",
        },
      },
      {
        kind: "system",
        id: "recap-3",
        timestampMs: -335340000,
        event: {
          type: "shared-context",
          source: { name: "Inbox" },
          summary: "this week’s client threads",
        },
      },
      {
        kind: "send-message",
        id: "recap-4",
        timestampMs: -335280000,
        message: {
          type: "text",
          content:
            "This week you shipped **v1.3.2** and the new onboarding, closed 3 client threads, and had 6 calls. Two of them turned into proposals.",
        },
      },
      {
        kind: "send-message",
        id: "recap-5",
        timestampMs: -335220000,
        message: {
          type: "text",
          content:
            "Next week I’d start with Leo’s revised quote. He’s been waiting since Tuesday. Then the two v1.4 blockers.",
        },
      },
      {
        kind: "message",
        id: "recap-6",
        role: "user",
        content: "remind me about leo monday morning",
        timestampMs: -334200000,
      },
      {
        kind: "system",
        id: "recap-7",
        timestampMs: -333900000,
        event: {
          type: "created-routine",
          name: "Leo’s quote",
          triggerDescription: "Once, Monday at 9:00 AM",
        },
      },
      {
        kind: "send-message",
        id: "recap-8",
        timestampMs: -333840000,
        message: {
          type: "text",
          content: "Set. I’ll bring up Leo’s quote Monday at 9.",
        },
      },
    ],
  },
  invoices: {
    name: "Invoices",
    lastMessage: "Both sent. I’ll check again next Monday.",
    lastActivityAt: -97140000,
    isPinned: false,
    hasUnread: false,
    unreadCount: 0,
    isRunning: false,
    transcript: [
      {
        kind: "message",
        id: "invoices-1",
        role: "user",
        content:
          "every monday, check stripe for invoices more than a week overdue and draft a friendly reminder for each. i'll approve them.",
        timestampMs: -432000000,
      },
      {
        kind: "system",
        id: "invoices-2",
        timestampMs: -432000000,
        event: {
          type: "created-routine",
          name: "Overdue invoices",
          triggerDescription: "Mondays at 9:00 AM",
        },
      },
      {
        kind: "send-message",
        id: "invoices-3",
        timestampMs: -101280000,
        message: {
          type: "text",
          content:
            "**2 invoices are overdue**: $1,200 from Harbor Coffee (12 days) and $450 from Northside Physio (9 days). Reminders are drafted below.",
        },
      },
      {
        kind: "outbound-message",
        id: "invoices-4",
        timestampMs: -101220000,
        channel: "email",
        from: "drew@kraftybot.app",
        to: "leo@harborcoffee.example",
        subject: "Invoice #1042",
        body: [
          "Hi Leo,",
          "Quick reminder that invoice #1042 for $1,200 was due on the 30th. You can pay it from the original invoice email whenever you get a chance.",
          "Thanks,",
          "Drew",
        ],
        status: "ready",
      },
      {
        kind: "message",
        id: "invoices-5",
        role: "user",
        content: "send both",
        timestampMs: -97200000,
      },
      {
        kind: "send-message",
        id: "invoices-6",
        timestampMs: -97140000,
        message: {
          type: "text",
          content: "Both sent. I’ll check again next Monday.",
        },
      },
    ],
  },
}
