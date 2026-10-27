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
    id: "chief-of-staff",
    title: "Right hand",
    description:
      "Runs your day: triages asks, preps decisions, and keeps the rest of the team pointed at what matters.",
    name: "Chief",
    color: "#50b6a3",
    shape: "blob",
    preview: "Availability request sent. Final quote is next.",
    time: "Yesterday",
    unread: false,
    group: false,
    entries: [
      {
        kind: "system",
        text: "Created routine Morning briefing",
      },
      {
        kind: "agent",
        text: "morning briefing:\n**Calendar**: 2pm double-booking found · board review prioritized\n**Deck**: numbers checked against finance's sheet · 2 stale slides flagged\n**Offsite**: 3 venues shortlisted · availability compared\n\ntwo things need you today: the deck review at 2pm, and a yes/no on the venue. everything else is handled.",
      },
      {
        kind: "user",
        text: "take the venue, i'll do the deck",
      },
      {
        kind: "agent",
        text: "the marina house is the pick: seats all 40, the mid-week rate came in 15% under budget, and they'll hold the date until tomorrow.",
      },
      {
        kind: "agent",
        text: "I’ve sent the availability request you approved. I’ll bring you the final quote before any deposit or booking commitment.",
      },
      {
        kind: "email",
        text: "Confirm offsite availability",
        initialState: "executed",
        email: {
          to: "events@marinahouse.example",
          subject: "Team offsite for 40 — availability",
          body: "Hi, could you confirm availability and send the final quote for our 40-person offsite? Please include the deposit and cancellation terms before we commit. Thanks, Drew",
        },
      },
    ],
    routines: [
      {
        name: "Morning briefing",
        trigger: "Weekdays at 8:00 AM",
      },
      {
        name: "End-of-week recap",
        trigger: "Fridays at 5:00 PM",
      },
    ],
  },
  {
    id: "sales-outbound",
    title: "Sales",
    description:
      "Works the pipeline overnight: researches the prospects worth a look, pulls their context together, and leaves sequences drafted for the morning.",
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
    id: "inbox-manager",
    title: "Email triage",
    description:
      "Keeps the inbox at zero: archives noise, drafts replies, and flags real fires.",
    name: "Inbox Manager",
    color: "#6761f2",
    shape: "wedge",
    preview: "26 threads ready to archive. Dana’s reply needs your review.",
    time: "10:08 AM",
    unread: true,
    group: false,
    entries: [
      {
        kind: "user",
        text: "inbox got away from me over the weekend, sweep it?",
      },
      {
        kind: "agent",
        text: "on it. **41 unread** since friday. I’ll identify the noise and prepare replies for your review.",
      },
      {
        kind: "agent",
        text: "**Ready to archive**: 26 newsletters + receipts\n**Reviewed**: 9 routine threads · scheduling and intros\n**Drafted**: 6 that sound like you · held for your read\n**Flagged**: 1 from dana · contract question",
      },
      {
        kind: "agent",
        text: "dana's asking whether the renewal covers the new seats. her draft answers yes and quotes the contract line. it's at the top of the held pile.",
      },
      {
        kind: "approval",
        text: "Archive 26 newsletters and receipts",
        confirmation:
          "Archived the 26 threads. You can still find them in All Mail.",
        approval: {
          toolkit: "gmail",
          details:
            "Move the 26 reviewed threads out of the inbox. Keep them searchable in All Mail.",
        },
      },
      {
        kind: "email",
        text: "Reply to Dana",
        email: {
          to: "dana@acme.example",
          subject: "Re: Renewal and additional seats",
          body: "Hi Dana, yes — the renewal covers the additional seats under the existing agreement. I’ve included the seat allocation in the renewal summary for your review. Best, Drew",
        },
      },
    ],
    routines: [],
  },
  {
    id: "account-manager",
    title: "Named accounts",
    description:
      "Owns the named accounts: keeps the threads warm and knows what each one is waiting on.",
    name: "Account Manager",
    color: "#8954f6",
    shape: "gem",
    preview: "Acme renewal review scheduled. Globex draft held.",
    time: "8:08 AM",
    unread: false,
    group: false,
    entries: [
      {
        kind: "user",
        text: "where are we with acme? renewal can't sneak up on us",
      },
      {
        kind: "agent",
        text: "pulling usage, open threads, and the exec notes together now.",
      },
      {
        kind: "agent",
        text: "**acme** renews in 60 days:\n**Usage**: 214 seats active · up 18% this quarter\n**Threads**: 2 open · security review + a pricing question\n**Next step**: renewal call with vicky drafted · week of the 18th",
      },
      {
        kind: "agent",
        text: "globex is the quiet one: nothing since the pilot wrapped. i wrote a re-engagement note that leads with their own pilot numbers. it's in drafts, not sent.",
      },
      {
        kind: "approval",
        text: "Create Acme renewal meeting",
        initialState: "executed",
        confirmation: "Created the renewal meeting and sent Vicky the invite.",
        approval: {
          toolkit: "googlecalendar",
          details:
            "Invite Vicky to a 30-minute renewal review on November 18 at 10:00 AM America/Chicago. The Globex draft stays unsent.",
        },
      },
    ],
    routines: [],
  },
  {
    id: "talent-scout",
    title: "Sourcing",
    description:
      "Keeps the candidate pipeline moving: sources profiles, drafts intros, and shortlists who's worth a call.",
    name: "Talent Scout",
    color: "#3583f4",
    shape: "blob",
    preview: "12 candidates shortlisted. Mara leads the list.",
    time: "5:08 AM",
    unread: false,
    group: false,
    entries: [
      {
        kind: "user",
        text: "take the platform engineer req: senior, infra-heavy, remote ok. source quietly.",
      },
      {
        kind: "agent",
        text: "on it. i'll screen overnight against the req and skip anyone already in the ats.",
      },
      {
        kind: "agent",
        text: "overnight run:\n**Sourced**: 64 profiles matched the req\n**Skipped**: 11 already in the ats\n**Shortlist**: 12 screened · notes on each",
      },
      {
        kind: "agent",
        text: "three worth your time first:\n**Mara Iyer**: scaled ingest 40× at a data startup · writes like an owner\n**Tomás Rivera**: runs a 6-person infra team · wants to build again\n**Grace Osei**: your exact stack end to end · shipped the migration you keep citing",
      },
      {
        kind: "user",
        text: "strong list, mara especially. draft the intros",
        reactions: ["👍"],
      },
      {
        kind: "agent",
        text: "Three intros drafted. Mara leads the shortlist; Tomás and Grace are close behind. The notes are ready whenever you want to review them.",
      },
    ],
    routines: [],
  },
  {
    id: "expense-manager",
    title: "Receipts & reports",
    description:
      "Files receipts as they land, matches them to trips, and flags anything that doesn't add up.",
    name: "Expense Manager",
    color: "#f6732a",
    shape: "blob",
    preview: "9 receipts reconciled. Report ready for approval.",
    time: "9:08 AM",
    unread: false,
    group: false,
    entries: [
      {
        kind: "user",
        text: "month-end is friday, close out the card for me?",
      },
      {
        kind: "agent",
        text: "i'll match every charge to a receipt and file the report. anything that doesn't line up, i ask instead of guessing.",
      },
      {
        kind: "system",
        text: "Created routine Month-end close",
      },
      {
        kind: "agent",
        text: "**Receipts**: 9 matched to card charges\n**Report**: drafted · $2,340 across 3 trips\n**Flagged**: 1 charge · harbor hotel, $412 twice",
      },
      {
        kind: "agent",
        text: "the harbor hotel charged $412 on the 12th and again on the 14th. double-billed, or two separate nights?",
      },
      {
        kind: "user",
        text: "two nights, mia stayed the second one",
      },
      {
        kind: "agent",
        text: "Thanks — I’ve marked the second night for Mia. The report is ready for your approval.",
      },
      {
        kind: "approval",
        text: "Submit month-end expense report",
        confirmation:
          "Added all 9 receipts to the expense tracker: $2,340 across 3 trips.",
        approval: {
          toolkit: "googlesheets",
          details:
            "Add 9 matched receipts totaling $2,340 across 3 trips to the expense tracker. Both Harbor Hotel nights are included.",
          alwaysAllowed: false,
        },
      },
    ],
    routines: [
      {
        name: "Month-end close",
        trigger: "Last Friday of the month",
      },
    ],
  },
  {
    id: "offsite-crew",
    title: "",
    description:
      "Shared room for wrapping up the offsite: recap, follow-ups, and thanks.",
    name: "Offsite crew",
    color: "#50b6a3",
    shape: "blob",
    preview: "Thank-you sent. Reconciling the final invoice.",
    time: "7:08 AM",
    unread: false,
    group: true,
    entries: [
      {
        kind: "user",
        text: "let's close out the offsite. what's left?",
      },
      {
        kind: "agent",
        text: "recap doc is done and owners are tagged. **3 follow-ups** land this week.",
        author: "Account Manager",
      },
      {
        kind: "agent",
        text: "The thank-you note you approved is sent. I’m waiting on the final itemized invoice.",
        author: "Inbox Manager",
      },
      {
        kind: "agent",
        text: "recap's shared. follow-ups, assigned:\n**Acme pricing follow-up**: @[Account Manager] · numbers by thursday\n**Speaker + venue thank-yous**: @[Inbox Manager] · sent\n**Final invoice**: me · reconciling against the expense report",
        reactions: ["👍"],
        author: "Chief",
      },
      {
        kind: "user",
        text: "great close-out. anything we missed?",
      },
      {
        kind: "agent",
        text: "The recap is shared and the thank-you is sent. The final invoice is the only open item.",
        author: "Chief",
      },
      {
        kind: "email",
        author: "Inbox Manager",
        text: "Offsite thank-you",
        initialState: "executed",
        email: {
          to: "events@marinahouse.example",
          subject: "Thank you from the team",
          body: "Hi team, thank you for hosting our offsite. We appreciated the space and your help throughout the day. Please send over the final itemized invoice when it’s ready. Best, Drew",
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
    title: "Your next teammate",
    description: "Set up a teammate and give it its first task.",
    preview: "",
    time: "1:08 PM",
    unread: false,
    group: false,
    entries: [],
    routines: [],
  },
]
export const heroEntries: DemoEntry[] = [
  {
    kind: "agent",
    text: "Hey Drew, good to meet you. What do you want me around for? Anything concrete, or more of a general sidekick?",
  },
  {
    kind: "user",
    text: "Overnight pipeline generation and outbound.\n\nPick eligible prospects from this Google Sheet, research them on the web, grab context on contacts and accounts from Hex, Sumble, and Salesforce. Draft email and LinkedIn sequences in my voice.",
  },
  {
    kind: "system",
    text: "Renamed to Sales Outbound",
  },
  {
    kind: "agent",
    text: "Checking what's connected. Hex, Gmail, and LinkedIn are already signed in. Salesforce isn't.",
  },
  {
    kind: "computer",
    text: "Sign in to Salesforce so I can see the accounts you own.",
  },
  {
    kind: "agent",
    text: "**Salesforce**: list pulled · 52 accounts\n**Hex**: 3 lookalike segments pulled\n**LinkedIn**: 4 profiles skipped · recently contacted\n**Sequencer**: 36 drafts queued · 0 sent",
  },
  {
    kind: "system",
    text: "Messages from",
    targets: ["Account Manager", "Chief"],
  },
  {
    kind: "agent",
    text: "@[Account Manager] sent over the Acme + Globex threads and @[Chief] flagged the priority accounts. Both are folded into tonight's list.",
  },
  {
    kind: "agent",
    text: "I prepared 36 email drafts from the prospect research. Review the top 10 recipients and openers before approving the send. The remaining 26 stay on hold.",
  },
  {
    kind: "user",
    text: "Prepare the top 10 for my approval. Research new prospects every week.",
    reactions: ["👍"],
  },
  {
    kind: "system",
    text: "Created routine Overnight outbound",
  },
  {
    kind: "approval",
    text: "Send the 10 reviewed outreach messages",
    confirmation:
      "Sent the 10 approved messages. The other 26 drafts are still on hold.",
    approval: {
      toolkit: "gmail",
      details:
        "Send only the 10 reviewed recipients. Keep the remaining 26 drafts on hold. The weekly routine researches and drafts; sending still requires approval.",
      alwaysAllowed: false,
    },
  },
]
export const heroPrompt =
  "Overnight pipeline generation and outbound.\n\nPick eligible prospects from this Google Sheet, research them on the web, grab context on contacts and accounts from Hex, Sumble, and Salesforce. Draft email and LinkedIn sequences in my voice."
