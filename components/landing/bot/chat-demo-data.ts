// Fictional examples of Krafty workflows. All demo decisions stay in the browser.
export type DemoEntry = {
  kind: "user" | "agent" | "system" | "computer" | "approval" | "email"
  text: string
  approval?: { toolkit: string; details: string; alwaysAllowed?: boolean }
  email?: { to: string; subject: string; body: string }
  initialState?: "executed" | "denied"
  confirmation?: string
  reactions?: string[]
  author?: string
  targets?: string[]
}
export type DemoAgent = {
  id: string
  name: string
  color: string
  shape: "blob" | "wedge" | "gem"
  title: string
  description: string
  preview: string
  time: string
  unread: boolean
  group: boolean
  entries: DemoEntry[]
  routines: { name: string; trigger: string }[]
}
export const demoAgents: DemoAgent[] = [
  {
    id: "rundown",
    title: "Daily organization",
    description:
      "Checks your calendar and inbox every morning and tells you what needs your attention.",
    name: "Rundown",
    color: "#50b6a3",
    shape: "blob",
    preview: "Asked the dentist for Thursday afternoon.",
    time: "Yesterday",
    unread: false,
    group: false,
    entries: [
      {
        kind: "system",
        text: "Created routine Morning rundown",
      },
      {
        kind: "agent",
        text: "Morning rundown:\n**Calendar**: 3 things today · your 2 PM client call overlaps the dentist\n**Inbox**: 2 emails need you · Priya’s invoice question, Leo’s contract\n**Everything else**: newsletters and receipts · nothing urgent\n\nThe overlap is the only real problem. Want me to ask the dentist for another day?",
      },
      {
        kind: "user",
        text: "yeah, ask for thursday afternoon. i'll keep the client call",
      },
      {
        kind: "agent",
        text: "Their booking page only takes changes by email, so I wrote a short note asking for Thursday afternoon.",
      },
      {
        kind: "agent",
        text: "You approved it and it’s sent. If they reply, it’ll be in tomorrow’s rundown.",
      },
      {
        kind: "email",
        text: "Move the dentist appointment",
        initialState: "executed",
        email: {
          to: "appointments@brightsmile.example",
          subject: "Moving today’s 2 PM appointment",
          body: "Hi, something came up at 2 PM today. Do you have anything Thursday afternoon instead? Thanks, Drew",
        },
      },
    ],
    routines: [
      {
        name: "Morning rundown",
        trigger: "Weekdays at 8:00 AM",
      },
    ],
  },
  {
    id: "prospecting",
    title: "Find clients",
    description:
      "Finds businesses that could use your services, skips anyone you’ve already contacted, and drafts a short intro for each.",
    name: "New agent",
    color: "#f7a32f",
    shape: "blob",
    preview: "",
    time: "1:08 PM",
    unread: false,
    group: false,
    entries: [],
    routines: [],
  },
  {
    id: "inbox",
    title: "Email",
    description:
      "Finds the emails that need a reply, drafts the answers, and leaves the rest alone.",
    name: "Inbox",
    color: "#6761f2",
    shape: "wedge",
    preview: "4 replies drafted. Priya’s needs your review.",
    time: "10:08 AM",
    unread: true,
    group: false,
    entries: [
      {
        kind: "user",
        text: "check my email, find anything i need to respond to, and draft the replies. don't send anything yet.",
      },
      {
        kind: "agent",
        text: "On it. **38 unread** since Friday. I’ll sort out what actually needs you.",
      },
      {
        kind: "agent",
        text: "**Needs a reply**: 4 · drafts ready for your read\n**Can wait**: 7 · shipping updates and calendar confirmations\n**Noise**: 27 newsletters and promos\n**Sent**: nothing",
      },
      {
        kind: "agent",
        text: "Priya’s is the one that matters. She’s asking if this invoice can be net 30. Your draft says yes for this one and keeps net 15 as the default.",
      },
      {
        kind: "approval",
        text: "Archive 27 newsletters and promos",
        confirmation:
          "Archived the 27 threads. You can still find them in All Mail.",
        approval: {
          toolkit: "gmail",
          details:
            "Move the 27 newsletters and promos out of the inbox. They stay searchable in All Mail.",
        },
      },
      {
        kind: "email",
        text: "Reply to Priya",
        email: {
          to: "priya@northfieldstudio.example",
          subject: "Re: Invoice terms",
          body: "Hi Priya, net 30 works for this invoice. We’ll keep net 15 as the default for future projects. Thanks, Drew",
        },
      },
    ],
    routines: [],
  },
  {
    id: "release-prep",
    title: "Developer work",
    description:
      "Reads your open GitHub issues and pull requests and tells you what’s blocking the next release.",
    name: "Release Prep",
    color: "#8954f6",
    shape: "gem",
    preview: "Two blockers left. Four issues moved to v1.5.",
    time: "8:08 AM",
    unread: false,
    group: false,
    entries: [
      {
        kind: "user",
        text: "look through my open github issues and tell me what's blocking the next release",
      },
      {
        kind: "agent",
        text: "Reading the v1.4 milestone, the open PRs, and the last few CI runs.",
      },
      {
        kind: "agent",
        text: "**v1.4** has 9 open issues:\n**Blocking**: 2 · Safari login redirect loop, failing migration test\n**In review**: 3 PRs · one approved and ready to merge\n**Can slip**: 4 · nice-to-haves with no linked PR",
      },
      {
        kind: "agent",
        text: "The redirect loop is the real one. It started after last week’s auth upgrade and has 3 duplicate reports. I’d fix it first and move the four nice-to-haves to v1.5.",
      },
      {
        kind: "approval",
        text: "Move 4 issues to v1.5",
        initialState: "executed",
        confirmation: "Moved the 4 issues to v1.5. v1.4 is down to 2 blockers.",
        approval: {
          toolkit: "github",
          details:
            "Change the milestone on the 4 issues with no linked PR from v1.4 to v1.5. Nothing else changes.",
        },
      },
    ],
    routines: [],
  },
  {
    id: "weekly-recap",
    title: "Recurring work",
    description:
      "Every Friday, sums up what changed this week and what to work on next.",
    name: "Weekly Recap",
    color: "#3583f4",
    shape: "blob",
    preview: "Friday recap is in. Leo’s quote comes first.",
    time: "5:08 AM",
    unread: false,
    group: false,
    entries: [
      {
        kind: "user",
        text: "every friday, summarize what changed this week and what i should work on next",
      },
      {
        kind: "system",
        text: "Created routine Friday recap",
      },
      {
        kind: "agent",
        text: "Friday recap:\n**Shipped**: v1.3.2 and the new onboarding flow\n**Clients**: 3 threads closed · Leo still waiting on a revised quote\n**Calls**: 6 this week · 2 turned into proposals",
      },
      {
        kind: "agent",
        text: "Next week I’d send Leo the revised quote first. He’s been waiting since Tuesday. Then the two v1.4 blockers.",
      },
      {
        kind: "user",
        text: "agreed. remind me about leo monday morning",
        reactions: ["👍"],
      },
      {
        kind: "agent",
        text: "Set. I’ll bring up Leo’s quote Monday at 9 AM.",
      },
    ],
    routines: [
      {
        name: "Friday recap",
        trigger: "Fridays at 4:00 PM",
      },
      {
        name: "Leo’s quote",
        trigger: "Once, Monday at 9:00 AM",
      },
    ],
  },
  {
    id: "research",
    title: "Web research",
    description:
      "Searches the web, reads the sources, and brings back a short answer with links.",
    name: "Research",
    color: "#f6732a",
    shape: "blob",
    preview: "3 laptops compared. The sheet update needs your OK.",
    time: "9:08 AM",
    unread: false,
    group: false,
    entries: [
      {
        kind: "user",
        text: "i need a laptop for dev work, under $2,000. compare the real options and add them to my purchases sheet",
      },
      {
        kind: "agent",
        text: "Checking current prices, long-term reviews, and spec sheets. I’ll stick to what’s actually in stock.",
      },
      {
        kind: "agent",
        text: "**Read**: 14 reviews and 5 store pages\n**Shortlist**: 3 laptops under $2,000\n**Ruled out**: 2 · slow down during long builds",
      },
      {
        kind: "agent",
        text: "The pick is the 14-inch with 32 GB of memory, about $1,800. The cheaper one only has 16 GB, which gets tight with Docker running.",
      },
      {
        kind: "user",
        text: "how's the battery on it?",
      },
      {
        kind: "agent",
        text: "Reviews put it at a full workday of coding, about two hours more than the cheaper one. Still the pick.",
      },
      {
        kind: "approval",
        text: "Add 3 laptops to your Purchases sheet",
        confirmation:
          "Added 3 rows to your Purchases sheet with prices and sources.",
        approval: {
          toolkit: "googlesheets",
          details:
            "Add one row per laptop with the price, memory, battery life, and source links.",
          alwaysAllowed: false,
        },
      },
    ],
    routines: [],
  },
  {
    id: "launch-week",
    title: "",
    description:
      "Shared room for launch week: release notes, the tester email, and the calendar.",
    name: "Launch week",
    color: "#50b6a3",
    shape: "blob",
    preview: "Tester email sent. The changelog is the last item.",
    time: "7:08 AM",
    unread: false,
    group: true,
    entries: [
      {
        kind: "user",
        text: "launch is thursday. what's left?",
      },
      {
        kind: "agent",
        text: "v1.4 is tagged and both blockers are fixed. Release notes are drafted for your read.",
        author: "Release Prep",
      },
      {
        kind: "agent",
        text: "The email to your beta testers is sent. I’ll flag any replies that need you.",
        author: "Inbox",
      },
      {
        kind: "agent",
        text: "Launch plan, by owner:\n**Release notes**: @[Release Prep] · ready for your read\n**Beta tester email**: @[Inbox] · sent\n**Thursday**: me · 9 to 12 blocked on your calendar",
        reactions: ["👍"],
        author: "Rundown",
      },
      {
        kind: "user",
        text: "nice. anything we missed?",
      },
      {
        kind: "agent",
        text: "The changelog page still says v1.3. That’s the only open item.",
        author: "Rundown",
      },
      {
        kind: "email",
        author: "Inbox",
        text: "Beta tester email",
        initialState: "executed",
        email: {
          to: "beta@kraftybot.app",
          subject: "v1.4 is out Thursday",
          body: "Hi all, v1.4 goes live Thursday. It fixes the Safari login loop and makes the dashboard faster. If anything breaks, reply here and I’ll take a look. Thanks for testing, Drew",
        },
      },
    ],
    routines: [],
  },
  {
    id: "new-bot",
    name: "New bot",
    color: "#b5a7fc",
    shape: "blob",
    title: "Your next Bot",
    description: "Set up a Bot and give it its first task.",
    preview: "",
    time: "1:08 PM",
    unread: false,
    group: false,
    entries: [],
    routines: [],
  },
]
export const heroPrompt =
  "Find 10 local businesses that could use my services and put together a short intro for each.\n\nI build websites and small web apps. Look for slow or outdated sites, skip anyone already in my HubSpot, and use my Gmail for the drafts. Don't send anything yet."
export const heroEntries: DemoEntry[] = [
  {
    kind: "agent",
    text: "Hi Drew. What should I take off your plate first?",
  },
  {
    kind: "user",
    text: heroPrompt,
  },
  {
    kind: "system",
    text: "Renamed to Prospecting",
  },
  {
    kind: "agent",
    text: "Gmail is connected. HubSpot isn’t, so I’ll check it in the browser on my computer.",
  },
  {
    kind: "computer",
    text: "Sign in to HubSpot so I can see who you’ve already contacted.",
  },
  {
    kind: "agent",
    text: "**Research**: 34 local businesses checked · sites, reviews, contact pages\n**HubSpot**: 6 skipped · already in your contacts\n**Shortlist**: 10 with slow, broken, or outdated sites\n**Drafts**: 10 intros written · 0 sent",
  },
  {
    kind: "system",
    text: "Messages from",
    targets: ["Inbox"],
  },
  {
    kind: "agent",
    text: "@[Inbox] found a café owner who asked about a new site in March and never got a reply. She’s first on the list.",
  },
  {
    kind: "agent",
    text: "Each intro points out something specific about their current site. Check the 10 recipients and openers before anything goes out.",
  },
  {
    kind: "user",
    text: "These look good. Send them, and find me new ones every Monday.",
    reactions: ["👍"],
  },
  {
    kind: "system",
    text: "Created routine Weekly prospecting",
  },
  {
    kind: "approval",
    text: "Send the 10 intro emails",
    confirmation:
      "Sent the 10 intros from your Gmail. Replies will land in your inbox.",
    approval: {
      toolkit: "gmail",
      details:
        "Send the 10 intros you reviewed from your Gmail. The Monday routine only researches and drafts; sending always waits for your approval.",
      alwaysAllowed: false,
    },
  },
]
