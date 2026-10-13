// Original x.ai/bot role demo transcript, with Krafty branding.
export type RoleEntry =
  | { kind: "message"; id: string; role: "user"; content: string; timestampMs: number }
  | { kind: "send-message"; id: string; timestampMs: number; message: { type: "text"; content: string } }
  | { kind: "system"; id: string; timestampMs: number; event: { type: "created-routine"; name: string; triggerDescription: string } | { type: "shared-context"; source: { name: string }; summary: string } }
  | { kind: "computer-use"; id: string; timestampMs: number; instruction: string; ask: string; status: "done" }
  | { kind: "outbound-message"; id: string; timestampMs: number; channel: "email" | "slack"; from?: string; workspace?: string; to: string; subject?: string; thread?: string; body: string[]; status: "ready" | "sent" }

export const roleScenarios: Record<string, { name: string; transcript: RoleEntry[] }> = {
  "paid-media": {
    "name": "Paid Media",
    "transcript": [
      {
        "kind": "message",
        "id": "paid-media-1",
        "role": "user",
        "content": "watch the channels every day and tell me when to move budget. never touch spend without me.",
        "timestampMs": -86400000
      },
      {
        "kind": "send-message",
        "id": "paid-media-2",
        "timestampMs": -1560000,
        "message": {
          "type": "text",
          "content": "signups 2.4x yesterday. spend is fine. one campaign burning on low ctr. recommendation: pause and shift $2k to the winner."
        }
      },
      {
        "kind": "send-message",
        "id": "paid-media-3",
        "timestampMs": -1500000,
        "message": {
          "type": "text",
          "content": "the loser is **broad retargeting**: $2,140 this week at 0.4% ctr against a 1.6% account average. **brand search** is converting at three times that and is capped out by noon."
        }
      },
      {
        "kind": "outbound-message",
        "id": "paid-media-4",
        "timestampMs": -1440000,
        "channel": "slack",
        "workspace": "Krafty Bot",
        "to": "#growth",
        "thread": "Daily channel read",
        "body": [
          "Signups are running 2.4× yesterday and month-to-date spend is on plan.",
          "One change worth making: pause Broad Retargeting (0.4% CTR, $2,140 this week) and move $2k of it to Brand Search, which caps out before noon. Holding until Sam approves."
        ],
        "status": "sent"
      },
      {
        "kind": "message",
        "id": "paid-media-5",
        "role": "user",
        "content": "do it",
        "timestampMs": -360000
      },
      {
        "kind": "send-message",
        "id": "paid-media-6",
        "timestampMs": -240000,
        "message": {
          "type": "text",
          "content": "paused and shifted. i'll watch the rest today."
        }
      }
    ]
  },
  "sales-outbound": {
    "name": "Sales Outbound",
    "transcript": [
      {
        "kind": "message",
        "id": "sales-outbound-1",
        "role": "user",
        "content": "work the pipeline overnight: research the accounts, score the contacts, draft email and linkedin in my voice. nothing goes out without me.",
        "timestampMs": -259200000
      },
      {
        "kind": "system",
        "id": "sales-outbound-2",
        "timestampMs": -259200000,
        "event": {
          "type": "created-routine",
          "name": "Overnight outbound batch",
          "triggerDescription": "Weeknights at 2:00 AM"
        }
      },
      {
        "kind": "send-message",
        "id": "sales-outbound-3",
        "timestampMs": -3120000,
        "message": {
          "type": "text",
          "content": "overnight batch ready: 36 queued in your voice, 4 skipped as recently touched. nothing sent."
        }
      },
      {
        "kind": "send-message",
        "id": "sales-outbound-4",
        "timestampMs": -3060000,
        "message": {
          "type": "text",
          "content": "scoring leans on hiring signals and docs traffic; the **top 10** cleared both. northwind is first: three infra roles posted this month and their VP replied to your march thread."
        }
      },
      {
        "kind": "outbound-message",
        "id": "sales-outbound-5",
        "timestampMs": -3000000,
        "channel": "email",
        "from": "sam@x.ai",
        "to": "dana@northwind.io",
        "subject": "Three infra roles and a migration",
        "body": [
          "Hi Dana,",
          "Saw Northwind opened three infra roles this month. Usually that means the migration you mentioned in March is finally moving.",
          "We cut the same work in half for two teams your size. Worth fifteen minutes next week?",
          "Sam"
        ],
        "status": "ready"
      },
      {
        "kind": "message",
        "id": "sales-outbound-6",
        "role": "user",
        "content": "send the top 10 emails, they look good",
        "timestampMs": -1200000
      },
      {
        "kind": "send-message",
        "id": "sales-outbound-7",
        "timestampMs": -1080000,
        "message": {
          "type": "text",
          "content": "top 10 sending. rest stay queued."
        }
      }
    ]
  },
  "bug-reproduction": {
    "name": "Bug Reproduction",
    "transcript": [
      {
        "kind": "message",
        "id": "bug-repro-1",
        "role": "user",
        "content": "when a bug report lands in support, try to reproduce it before it goes to eng.",
        "timestampMs": -18000000
      },
      {
        "kind": "computer-use",
        "id": "bug-repro-2",
        "timestampMs": -7200000,
        "instruction": "Approve the staging login so I can run checkout the way the customer did.",
        "ask": "Approve the staging login",
        "status": "done"
      },
      {
        "kind": "send-message",
        "id": "bug-repro-3",
        "timestampMs": -3600000,
        "message": {
          "type": "text",
          "content": "caught the “pay button spins” thread. repro'd in staging: fails on discounted annual + tax. steps, screenshots, har in the doc."
        }
      },
      {
        "kind": "send-message",
        "id": "bug-repro-4",
        "timestampMs": -3480000,
        "message": {
          "type": "text",
          "content": "**4 of 4 attempts** fail with a discount code on an annual plan in a taxed region. monthly is clean, and annual without a code is clean, so it's the two together."
        }
      },
      {
        "kind": "message",
        "id": "bug-repro-5",
        "role": "user",
        "content": "send to eng",
        "timestampMs": -2640000
      },
      {
        "kind": "outbound-message",
        "id": "bug-repro-6",
        "timestampMs": -2520000,
        "channel": "slack",
        "workspace": "Krafty Bot",
        "to": "#eng-checkout",
        "thread": "Pay button spins on discounted annual",
        "body": [
          "Reproduced the support thread in staging: the pay button hangs on an annual plan with a discount code in a taxed region. 4 of 4 attempts.",
          "Steps, screenshots, and the HAR are in the doc. Monthly and undiscounted annual both pass."
        ],
        "status": "sent"
      },
      {
        "kind": "send-message",
        "id": "bug-repro-7",
        "timestampMs": -2460000,
        "message": {
          "type": "text",
          "content": "dropped in #eng-checkout. i'll re-run when the pr updates."
        }
      }
    ]
  },
  "product-performance": {
    "name": "Product Performance",
    "transcript": [
      {
        "kind": "message",
        "id": "product-perf-1",
        "role": "user",
        "content": "watch checkout latency and tell me when something moves.",
        "timestampMs": -28800000
      },
      {
        "kind": "computer-use",
        "id": "product-perf-2",
        "timestampMs": -15600000,
        "instruction": "Approve the SSO prompt on Datadog so I can pull the checkout traces.",
        "ask": "Approve the Datadog SSO prompt",
        "status": "done"
      },
      {
        "kind": "send-message",
        "id": "product-perf-3",
        "timestampMs": -12000000,
        "message": {
          "type": "text",
          "content": "checkout p95 spiked overnight. logged into datadog on my computer and pulled flamegraphs: 2 hot spots in the payment path. writeup + screenshots in the doc."
        }
      },
      {
        "kind": "send-message",
        "id": "product-perf-4",
        "timestampMs": -11880000,
        "message": {
          "type": "text",
          "content": "**p95 is 2.1s**, up from 780ms at the same hour last week. both hot spots sit in the tax lookup: one retry loop with no backoff, one currency call that stopped hitting cache after friday's deploy."
        }
      },
      {
        "kind": "message",
        "id": "product-perf-5",
        "role": "user",
        "content": "send to eng in slack",
        "timestampMs": -7800000
      },
      {
        "kind": "outbound-message",
        "id": "product-perf-6",
        "timestampMs": -7320000,
        "channel": "slack",
        "workspace": "Krafty Bot",
        "to": "#team-eng-perf",
        "thread": "Checkout p95 overnight",
        "body": [
          "Checkout p95 went from 780ms to 2.1s overnight. Flamegraphs point at two hot spots in the payment path: a retry loop without backoff and a currency call that stopped hitting cache after Friday's deploy.",
          "Writeup and screenshots are in the doc."
        ],
        "status": "sent"
      },
      {
        "kind": "send-message",
        "id": "product-perf-7",
        "timestampMs": -7200000,
        "message": {
          "type": "text",
          "content": "posted in #team-eng-perf with the pack."
        }
      }
    ]
  },
  "chief-of-staff": {
    "name": "Chief",
    "transcript": [
      {
        "kind": "system",
        "id": "chief-1",
        "timestampMs": -604800000,
        "event": {
          "type": "created-routine",
          "name": "Morning scan",
          "triggerDescription": "Weekdays at 7:30 AM"
        }
      },
      {
        "kind": "send-message",
        "id": "chief-2",
        "timestampMs": -14400000,
        "message": {
          "type": "text",
          "content": "morning: 3 meetings, 2 flagged emails, meeting at 3:00pm needs prep. reply drafts ready on the two flagged emails."
        }
      },
      {
        "kind": "system",
        "id": "chief-3",
        "timestampMs": -14340000,
        "event": {
          "type": "shared-context",
          "source": {
            "name": "Account Health"
          },
          "summary": "the acme usage brief"
        }
      },
      {
        "kind": "outbound-message",
        "id": "chief-4",
        "timestampMs": -14280000,
        "channel": "email",
        "from": "sam@x.ai",
        "to": "vicky@acme.co",
        "subject": "Re: Thursday's numbers",
        "body": [
          "Hi Vicky,",
          "Thursday works. I'll bring the usage summary. Seats and the integration counts are both in there.",
          "Sam"
        ],
        "status": "ready"
      },
      {
        "kind": "message",
        "id": "chief-5",
        "role": "user",
        "content": "send the easy one, leave legal",
        "timestampMs": -11100000
      },
      {
        "kind": "send-message",
        "id": "chief-6",
        "timestampMs": -10800000,
        "message": {
          "type": "text",
          "content": "sent one. legal stays. meeting brief for acme is in the thread."
        }
      }
    ]
  },
  "account-health": {
    "name": "Account Health",
    "transcript": [
      {
        "kind": "message",
        "id": "account-health-1",
        "role": "user",
        "content": "read usage and signals across my book and tell me what's at risk before the qbr.",
        "timestampMs": -432000000
      },
      {
        "kind": "system",
        "id": "account-health-2",
        "timestampMs": -432000000,
        "event": {
          "type": "created-routine",
          "name": "Portfolio watch",
          "triggerDescription": "Weekdays at 7:00 AM"
        }
      },
      {
        "kind": "system",
        "id": "account-health-3",
        "timestampMs": -18000000,
        "event": {
          "type": "shared-context",
          "source": {
            "name": "Chief"
          },
          "summary": "the acme thread history"
        }
      },
      {
        "kind": "send-message",
        "id": "account-health-4",
        "timestampMs": -17940000,
        "message": {
          "type": "text",
          "content": "acme call in 40 min. brief from granola + crm + slack is ready. three open threads, recommend push pricing."
        }
      },
      {
        "kind": "send-message",
        "id": "account-health-5",
        "timestampMs": -17880000,
        "message": {
          "type": "text",
          "content": "seats are **92% used** against the contract and two admins wired up new integrations last week. the pricing conversation has been open since march, so it's the one thread that's actually cold."
        }
      },
      {
        "kind": "message",
        "id": "account-health-6",
        "role": "user",
        "content": "looks right",
        "timestampMs": -14700000
      },
      {
        "kind": "send-message",
        "id": "account-health-7",
        "timestampMs": -14400000,
        "message": {
          "type": "text",
          "content": "locked on the invite. i'll draft follow-ups when the call ends."
        }
      }
    ]
  },
  "talent-scout": {
    "name": "Talent Scout",
    "transcript": [
      {
        "kind": "message",
        "id": "talent-scout-1",
        "role": "user",
        "content": "keep the sf infra role moving while i'm out. source, draft outreach in my voice, skip anyone already in the ats.",
        "timestampMs": -172800000
      },
      {
        "kind": "system",
        "id": "talent-scout-2",
        "timestampMs": -172800000,
        "event": {
          "type": "created-routine",
          "name": "Nightly sourcing pass",
          "triggerDescription": "Weeknights at 1:00 AM"
        }
      },
      {
        "kind": "send-message",
        "id": "talent-scout-3",
        "timestampMs": -25200000,
        "message": {
          "type": "text",
          "content": "5 profiles ready, notes in your voice. two look strong for the sf role."
        }
      },
      {
        "kind": "send-message",
        "id": "talent-scout-4",
        "timestampMs": -25080000,
        "message": {
          "type": "text",
          "content": "the two are both infra at series-c shops and neither is in the ats. the other three are worth a read but junior for the band."
        }
      },
      {
        "kind": "outbound-message",
        "id": "talent-scout-5",
        "timestampMs": -24960000,
        "channel": "email",
        "from": "sam@x.ai",
        "to": "jordan.ok@hey.com",
        "subject": "Infra work in SF",
        "body": [
          "Hi Jordan,",
          "You spent three years on the storage layer at Basalt, which is roughly the problem we're staring at now: same scale, fewer people.",
          "Happy to walk you through what we're building. Any interest in a call this week?",
          "Sam"
        ],
        "status": "ready"
      },
      {
        "kind": "message",
        "id": "talent-scout-6",
        "role": "user",
        "content": "outreach the first two",
        "timestampMs": -21840000
      },
      {
        "kind": "send-message",
        "id": "talent-scout-7",
        "timestampMs": -21600000,
        "message": {
          "type": "text",
          "content": "queued. i'll handle scheduling when they reply."
        }
      }
    ]
  },
  "expense-manager": {
    "name": "Expense Manager",
    "transcript": [
      {
        "kind": "message",
        "id": "expense-1",
        "role": "user",
        "content": "own the weekly expense summary: pull ramp and the sheet, file receipts out of my email, chase whatever's missing.",
        "timestampMs": -345600000
      },
      {
        "kind": "system",
        "id": "expense-2",
        "timestampMs": -345600000,
        "event": {
          "type": "created-routine",
          "name": "Weekly expense summary",
          "triggerDescription": "Fridays at 4:00 PM"
        }
      },
      {
        "kind": "send-message",
        "id": "expense-3",
        "timestampMs": -37200000,
        "message": {
          "type": "text",
          "content": "weekly summary's up from ramp + sheets. 14 receipts filed, 3 missing categories. nudged the owners."
        }
      },
      {
        "kind": "outbound-message",
        "id": "expense-4",
        "timestampMs": -37080000,
        "channel": "slack",
        "workspace": "Krafty Bot",
        "to": "#ops-expenses",
        "thread": "Missing categories this week",
        "body": [
          "Three charges are still uncategorized ahead of Thursday's review: Dana ($480, vendor dinner?), Miguel ($1,210, conference), and Vicky ($96).",
          "Drop a category on yours and I'll fold it into the summary."
        ],
        "status": "sent"
      },
      {
        "kind": "send-message",
        "id": "expense-5",
        "timestampMs": -36000000,
        "message": {
          "type": "text",
          "content": "one thing to look at: a **$312** charge on your card from saturday doesn't match anything on the calendar or in the receipts."
        }
      },
      {
        "kind": "message",
        "id": "expense-6",
        "role": "user",
        "content": "drop my personal charge",
        "timestampMs": -32700000
      },
      {
        "kind": "send-message",
        "id": "expense-7",
        "timestampMs": -32400000,
        "message": {
          "type": "text",
          "content": "dropped. review doc is ready for thursday."
        }
      }
    ]
  }
}
