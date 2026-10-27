import type { DemoEntry } from "./chat-demo-data"

// Self-contained prompts give the example all the facts it needs to do the work.
export const demoFirstTasks = [
  {
    label: "Tighten a client update",
    prompt:
      "Tighten this update for Dana: “We are still working on the rollout and we think we will probably finish on Friday.” Keep the uncertainty about Friday. Draft an email for my review.",
    result:
      "I made it more direct and kept Friday as a target, not a promise. Here’s the draft.",
    entry: {
      kind: "email",
      text: "Client rollout update",
      email: {
        to: "dana@acme.example",
        subject: "Rollout update",
        body: "Hi Dana, the rollout is in progress. We’re targeting Friday and will confirm once the remaining work is complete. Best, Drew",
      },
    } satisfies DemoEntry,
  },
  {
    label: "Compare two vendor quotes",
    prompt:
      "Compare these quotes for our 20-person team: Acme is $240/month for 20 seats; Globex is $300/month for 30 seats. Draft the recommendation to Dana.",
    result:
      "Acme is $12 per seat; Globex is $10. For 20 people, Acme costs $60 less per month. Globex becomes worth considering if you need the extra seats. I’ve drafted that recommendation.",
    entry: {
      kind: "email",
      text: "Vendor comparison",
      email: {
        to: "dana@acme.example",
        subject: "Vendor quotes: recommendation for 20 seats",
        body: "Hi Dana, I recommend Acme for our current 20-person team: $240/month versus $300/month for Globex, saving $720/year. Globex has a lower per-seat rate ($10 versus $12), but we would be paying for 10 seats we don’t currently need. We should revisit if the team grows. Best, Drew",
      },
    } satisfies DemoEntry,
  },
  {
    label: "Prepare a renewal meeting",
    prompt:
      "Prepare a 30-minute renewal review with Vicky on November 18 at 10 AM Chicago time. Hold the calendar invite for my approval.",
    result:
      "The invite is ready for November 18, 10:00–10:30 AM America/Chicago. I’ll send it once you approve.",
    entry: {
      kind: "approval",
      text: "Create renewal review with Vicky",
      approval: {
        toolkit: "googlecalendar",
        details:
          "November 18 · 10:00–10:30 AM · America/Chicago. Invite Vicky to review the renewal, open questions, and next steps.",
      },
      confirmation:
        "Created the renewal review for November 18 at 10 AM Chicago time and sent Vicky the invite.",
    } satisfies DemoEntry,
  },
]
