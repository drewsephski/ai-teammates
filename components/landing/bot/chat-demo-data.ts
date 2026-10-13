// Extracted from x.ai/bot's shipped hero demo, module 143452.
export type DemoEntry = { kind: 'user' | 'agent' | 'system' | 'computer'; text: string; reactions?: string[]; author?: string; targets?: string[] }
export type DemoAgent = { id: string; name: string; color: string; shape: 'blob' | 'wedge' | 'gem'; preview: string; time: string; unread: boolean; group: boolean; entries: DemoEntry[]; routines: {name:string;trigger:string}[] }
export const demoAgents: DemoAgent[] = [
  {
    "id": "chief-of-staff",
    "name": "Chief",
    "color": "#50b6a3",
    "shape": "blob",
    "preview": "booked the venue and sent the confirmation around.",
    "time": "Yesterday",
    "unread": false,
    "group": false,
    "entries": [
      {
        "kind": "system",
        "text": "Created routine Morning briefing"
      },
      {
        "kind": "agent",
        "text": "morning briefing:\n✓ **Calendar** → 2pm double-booking resolved · board review kept\n✓ **Deck** → numbers checked against finance's sheet · 2 stale slides flagged\n✓ **Offsite** → 3 venues shortlisted · dates held on each\n\ntwo things need you today: the deck review at 2pm, and a yes/no on the venue. everything else is handled."
      },
      {
        "kind": "user",
        "text": "take the venue, i'll do the deck"
      },
      {
        "kind": "agent",
        "text": "the marina house is the pick: seats all 40, the mid-week rate came in 15% under budget, and they'll hold the date until tomorrow."
      },
      {
        "kind": "user",
        "text": "book it",
        "reactions": [
          "👍"
        ]
      },
      {
        "kind": "agent",
        "text": "✓ **Venue** → marina house booked · deposit paid\n✓ **Calendar** → invites updated for all 40\n✓ **Holds** → other two released with a thank-you"
      },
      {
        "kind": "agent",
        "text": "booked the venue and sent the confirmation around. you're clear until the 2pm deck review."
      }
    ],
    "routines": [
      {
        "name": "Morning briefing",
        "trigger": "Weekdays at 8:00 AM"
      },
      {
        "name": "End-of-week recap",
        "trigger": "Fridays at 5:00 PM"
      }
    ]
  },
  {
    "id": "sales-outbound",
    "name": "New agent",
    "color": "#f7a32f",
    "shape": "blob",
    "preview": "",
    "time": "1:08 PM",
    "unread": false,
    "group": false,
    "entries": [],
    "routines": []
  },
  {
    "id": "inbox-manager",
    "name": "Inbox Manager",
    "color": "#6761f2",
    "shape": "wedge",
    "preview": "sent. inbox at zero, 5 drafts parked for tomorrow.",
    "time": "10:08 AM",
    "unread": true,
    "group": false,
    "entries": [
      {
        "kind": "user",
        "text": "inbox got away from me over the weekend, sweep it?"
      },
      {
        "kind": "agent",
        "text": "on it. **41 unread** since friday. archiving the noise, drafting the rest."
      },
      {
        "kind": "agent",
        "text": "✓ **Archived** → 26 newsletters + receipts\n✓ **Replied** → 9 routine threads · scheduling and intros\n✓ **Drafted** → 6 that sound like you · held for your read\n✓ **Flagged** → 1 from dana · contract question"
      },
      {
        "kind": "agent",
        "text": "dana's asking whether the renewal covers the new seats. her draft answers yes and quotes the contract line. it's at the top of the held pile."
      },
      {
        "kind": "user",
        "text": "send dana's, i'll take the rest tomorrow",
        "reactions": [
          "👍"
        ]
      },
      {
        "kind": "agent",
        "text": "sent. inbox is at **zero**, with 5 drafts parked for tomorrow."
      }
    ],
    "routines": []
  },
  {
    "id": "account-manager",
    "name": "Account Manager",
    "color": "#8954f6",
    "shape": "gem",
    "preview": "invite's out to vicky. globex note held in drafts.",
    "time": "8:08 AM",
    "unread": false,
    "group": false,
    "entries": [
      {
        "kind": "user",
        "text": "where are we with acme? renewal can't sneak up on us"
      },
      {
        "kind": "agent",
        "text": "pulling usage, open threads, and the exec notes together now."
      },
      {
        "kind": "agent",
        "text": "**acme** renews in 60 days:\n✓ **Usage** → 214 seats active · up 18% this quarter\n✓ **Threads** → 2 open · security review + a pricing question\n✓ **Next step** → renewal call with vicky drafted · week of the 18th"
      },
      {
        "kind": "agent",
        "text": "globex is the quiet one: nothing since the pilot wrapped. i wrote a re-engagement note that leads with their own pilot numbers. it's in drafts, not sent."
      },
      {
        "kind": "user",
        "text": "send the acme invite. hold globex until i've read the note",
        "reactions": [
          "👍"
        ]
      },
      {
        "kind": "system",
        "text": "Updated memory"
      },
      {
        "kind": "agent",
        "text": "invite's out to vicky. the globex note is holding in drafts, and quiet-account sends wait for your read from now on."
      }
    ],
    "routines": []
  },
  {
    "id": "talent-scout",
    "name": "Talent Scout",
    "color": "#3583f4",
    "shape": "blob",
    "preview": "3 intros drafted in your voice, held for your ok.",
    "time": "5:08 AM",
    "unread": false,
    "group": false,
    "entries": [
      {
        "kind": "user",
        "text": "take the platform engineer req: senior, infra-heavy, remote ok. source quietly."
      },
      {
        "kind": "agent",
        "text": "on it. i'll screen overnight against the req and skip anyone already in the ats."
      },
      {
        "kind": "agent",
        "text": "overnight run:\n✓ **Sourced** → 64 profiles matched the req\n✓ **Skipped** → 11 already in the ats\n✓ **Shortlist** → 12 screened · notes on each"
      },
      {
        "kind": "agent",
        "text": "three worth your time first:\n**Mara Iyer** → scaled ingest 40× at a data startup · writes like an owner\n**Tomás Rivera** → runs a 6-person infra team · wants to build again\n**Grace Osei** → your exact stack end to end · shipped the migration you keep citing"
      },
      {
        "kind": "user",
        "text": "strong list, mara especially. draft the intros",
        "reactions": [
          "👍"
        ]
      },
      {
        "kind": "agent",
        "text": "3 intros drafted in your voice and held for your ok. nothing sends until you've read them."
      }
    ],
    "routines": []
  },
  {
    "id": "expense-manager",
    "name": "Expense Manager",
    "color": "#f6732a",
    "shape": "blob",
    "preview": "report filed. 9 receipts, nothing outstanding.",
    "time": "9:08 AM",
    "unread": false,
    "group": false,
    "entries": [
      {
        "kind": "user",
        "text": "month-end is friday, close out the card for me?"
      },
      {
        "kind": "agent",
        "text": "i'll match every charge to a receipt and file the report. anything that doesn't line up, i ask instead of guessing."
      },
      {
        "kind": "system",
        "text": "Created routine Month-end close"
      },
      {
        "kind": "agent",
        "text": "✓ **Receipts** → 9 matched to card charges\n✓ **Report** → drafted · $2,340 across 3 trips\n✓ **Flagged** → 1 charge · harbor hotel, $412 twice"
      },
      {
        "kind": "agent",
        "text": "the harbor hotel charged $412 on the 12th and again on the 14th. double-billed, or two separate nights?"
      },
      {
        "kind": "user",
        "text": "two nights, mia stayed the second one"
      },
      {
        "kind": "agent",
        "text": "that clears it. report filed: **9 receipts** matched, $2,340 across 3 trips, nothing outstanding."
      }
    ],
    "routines": [
      {
        "name": "Month-end close",
        "trigger": "Last Friday of the month"
      }
    ]
  },
  {
    "id": "offsite-crew",
    "name": "Offsite crew",
    "color": "#50b6a3",
    "shape": "blob",
    "preview": "that leaves the pipeline. i'd spin up a dedicated agent.",
    "time": "7:08 AM",
    "unread": false,
    "group": true,
    "entries": [
      {
        "kind": "user",
        "text": "let's close out the offsite. what's left?"
      },
      {
        "kind": "agent",
        "text": "recap doc is done and owners are tagged. **3 follow-ups** land this week.",
        "author": "Account Manager"
      },
      {
        "kind": "agent",
        "text": "thank-you notes went out to the venue and the speakers this morning.",
        "author": "Inbox Manager"
      },
      {
        "kind": "agent",
        "text": "recap's shared. follow-ups, assigned:\n✓ **Acme pricing follow-up** → @[Account Manager] · numbers by thursday\n✓ **Speaker + venue thank-yous** → @[Inbox Manager] · done this morning\n✓ **Final invoice** → me · reconciling against the expense report",
        "reactions": [
          "👍"
        ],
        "author": "Chief"
      },
      {
        "kind": "user",
        "text": "great close-out. anything we missed?"
      },
      {
        "kind": "agent",
        "text": "that leaves the pipeline: nobody's touched the quiet accounts. i'd spin up a dedicated agent for outbound.",
        "author": "Chief"
      }
    ],
    "routines": []
  }
]
export const heroEntries: DemoEntry[] = [
  {
    "kind": "agent",
    "text": "Hey Armand, good to meet you. What do you want me around for? Anything concrete, or more of a general sidekick?"
  },
  {
    "kind": "user",
    "text": "Overnight pipeline generation and outbound.\n\nPick eligible prospects from this Google Sheet, research them on the web, grab context on contacts and accounts from Hex, Sumble, and Salesforce. Draft email and LinkedIn sequences in my voice."
  },
  {
    "kind": "system",
    "text": "Renamed to Sales Outbound"
  },
  {
    "kind": "agent",
    "text": "Checking what's connected. Hex, Gmail, and LinkedIn are already signed in. Salesforce isn't."
  },
  {
    "kind": "computer",
    "text": "Sign in to Salesforce so I can see the accounts you own."
  },
  {
    "kind": "agent",
    "text": "✓ **Salesforce** → list pulled · 52 accounts\n✓ **Hex** → 3 lookalike segments pulled\n✓ **LinkedIn** → 4 profiles skipped · recently contacted\n✓ **Sequencer** → 36 drafts queued · 0 sent"
  },
  {
    "kind": "system",
    "text": "Received context from",
    "targets": [
      "Account Manager",
      "Chief"
    ]
  },
  {
    "kind": "agent",
    "text": "@[Account Manager] sent over the Acme + Globex threads and @[Chief] flagged the priority accounts. Both are folded into tonight's list."
  },
  {
    "kind": "agent",
    "text": "The 36 drafts are sitting in the LinkedIn queue on my screen: recipient, opener, and a Draft badge on each. Nothing goes out until you've had a look."
  },
  {
    "kind": "user",
    "text": "The top 10 look good. Send it. Run this every week.",
    "reactions": [
      "👍"
    ]
  },
  {
    "kind": "system",
    "text": "Created routine Overnight outbound"
  },
  {
    "kind": "agent",
    "text": "Done."
  }
]
export const heroPrompt = "Overnight pipeline generation and outbound.\n\nPick eligible prospects from this Google Sheet, research them on the web, grab context on contacts and accounts from Hex, Sumble, and Salesforce. Draft email and LinkedIn sequences in my voice."
