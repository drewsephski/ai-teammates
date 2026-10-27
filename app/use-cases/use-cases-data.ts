// Starter prompts people can paste into a new Bot. Each one names the apps it
// connects to, so the Bot asks to link them on the first run.
const prompts: Record<string, string> = {
  "sales-outbound":
    "Every weeknight at 2am, pull the HubSpot companies tagged “Target” that nobody has emailed in 30 days. For each, check their careers page and recent news for buying signals, find the VP of Engineering, and draft a three-sentence email in my voice based on my sent Gmail. Rank the top 10 in a Google Sheet with the signal behind each, and message me on Slack when it’s ready. Don’t send anything.",
  "talent-scout":
    "Find 15 senior infrastructure engineers in the Bay Area who have worked at Series B to D startups, skipping anyone already in Greenhouse. Write each a short note that references their actual work, list them in a Google Sheet with links and why they fit, and once I approve, send the notes from my Gmail and offer three open slots from my Google Calendar.",
  "paid-media":
    "Every morning at 8, pull yesterday’s spend, CTR, and conversions from Google Ads and Meta Ads and compare them to the monthly budget in my “Ad Plan” Google Sheet. Post a five-line summary in #growth on Slack. If a campaign has been above target CPA for three days running, recommend a specific reallocation and wait for my OK before changing anything.",
  "expense-manager":
    "Every Friday at 4pm, search my Gmail for this week’s receipts and invoices, save the PDFs to a “Receipts 2026” folder in Google Drive, and log the vendor, amount, date, and category of each in my “Expenses” Google Sheet. Flag anything over $500 or without a clear category, and DM the person who spent it on Slack to fill it in.",
  "product-performance":
    "Log into our Datadog, pull checkout p95 latency for the last 7 days, and compare it to the week before. If it’s up more than 20%, open the slowest traces, screenshot the flamegraphs, match the jump to a merged GitHub PR, and write a one-page Notion doc with the likely cause. Post the link in #eng-perf on Slack.",
  "bug-reproduction":
    "When a new Intercom conversation is tagged “bug”, follow the customer’s steps on our staging site in your browser. If it reproduces, capture screenshots and console errors, then open a Linear issue for the Web team with numbered repro steps, expected vs. actual behavior, and the customer’s plan. Reply in the Intercom thread’s internal notes with the link either way.",
  "account-health":
    "Every Monday, pull every Salesforce account renewing in the next 90 days. For each, check seat usage in Stripe, open tickets in Zendesk, and the last email thread in my Gmail. Rank them by churn risk in a Google Sheet with one line of reasoning each, and draft a check-in email in Gmail for the five most at risk.",
  "chief-of-staff":
    "Every weekday at 7:30am, read my unread Gmail, Slack DMs, and today’s Google Calendar. Send me one Slack message with the meetings that need prep and a three-bullet brief on each attendee from our past emails, the emails that need a reply today with drafts waiting in Gmail, and any thread I promised to follow up on but haven’t.",
  "support-triage":
    "Every hour, read new Zendesk tickets. Draft replies to how-to questions using our Notion help center, tag billing issues for finance, and for anything that looks like a bug, search Linear for an existing issue and link it or file a new one with repro steps. Post anything urgent in #support on Slack and tag me.",
}

type UseCaseDetails = {
  /** Search-shaped page title, "AI agent for …". */
  headline: string
  /** One answer-first paragraph for the role page. */
  summary: string
  /** Apps the starter prompt names. Each one is connected by the person. */
  apps: string[]
  /** When the starter prompt runs it. */
  schedule: string
  /** What the Bot does by itself, in order. */
  steps: string[]
  /** What waits for the person's approval or review. */
  waitsForYou: string[]
}

// Role pages at /use-cases/[id]. Everything here follows from the starter
// prompt and the approval rules in docs/autonomy.md; claim nothing more.
const details: Record<string, UseCaseDetails> = {
  "sales-outbound": {
    headline: "AI agent for outbound sales",
    summary:
      "A Sales Outbound Bot researches target accounts overnight, finds the right contact, and drafts short emails in your voice. You start the day with a ranked review list instead of a blank sequence.",
    apps: ["HubSpot", "Gmail", "Google Sheets", "Slack"],
    schedule: "Every weeknight, as a routine",
    steps: [
      "Pulls target companies from your CRM that nobody has emailed recently",
      "Checks each company's careers page and recent news for buying signals",
      "Finds the contact you asked for and drafts a three-sentence email based on your sent mail",
      "Ranks the best ten in a sheet with the signal behind each, and messages you when it's ready",
    ],
    waitsForYou: [
      "No email is sent. The drafts wait for you to review and send",
      "Writing to the sheet needs approval unless an eligible rule allows it; posting in Slack needs approval every time",
    ],
  },
  "talent-scout": {
    headline: "AI agent for recruiting and sourcing",
    summary:
      "A Talent Scout Bot sources candidates who match your brief and skips anyone already in your applicant tracking system. Its outreach references each person's actual work.",
    apps: ["Greenhouse", "Google Sheets", "Gmail", "Google Calendar"],
    schedule: "On request, or as a weekly routine",
    steps: [
      "Searches the web for people who match the role, location, and background you describe",
      "Checks your applicant tracking system so it doesn't contact people already in process",
      "Lists each candidate in a sheet with links and why they fit",
      "Drafts a short, specific note to each one",
    ],
    waitsForYou: [
      "Notes go out from your Gmail only after you approve them",
      "Interview slots are offered from your calendar only after you approve",
    ],
  },
  "paid-media": {
    headline: "AI agent for paid media reporting",
    summary:
      "A Paid Media Bot pulls yesterday's spend and results every morning, compares them with your monthly plan, and posts a short summary. It recommends budget moves and changes nothing until you agree.",
    apps: ["Google Ads", "Meta Ads", "Google Sheets", "Slack"],
    schedule: "Every morning, as a routine",
    steps: [
      "Pulls spend, click-through rate, and conversions from each ad account",
      "Compares them with the budget in your plan sheet",
      "Posts a five-line summary to your team channel",
      "Flags campaigns that stay above target cost per acquisition and recommends a specific reallocation",
    ],
    waitsForYou: [
      "Every bid or budget change waits for your OK",
      "Posting the summary needs your approval every time; Slack posts cannot be always allowed",
    ],
  },
  "expense-manager": {
    headline: "AI agent for receipts and expenses",
    summary:
      "An Expense Manager Bot collects the week's receipts from your inbox, files them, and logs each one in your expense sheet. The books are clean before review.",
    apps: ["Gmail", "Google Drive", "Google Sheets", "Slack"],
    schedule: "Every Friday afternoon, as a routine",
    steps: [
      "Searches your inbox for the week's receipts and invoices",
      "Saves each file to a receipts folder",
      "Logs vendor, amount, date, and category in your expense sheet",
      "Flags large or uncategorized expenses",
    ],
    waitsForYou: [
      "Saving files and writing rows are app writes, so they wait for your approval unless you always allow them",
      "Messages asking teammates to fill in a category wait for your approval",
    ],
  },
  "product-performance": {
    headline: "AI agent for performance investigations",
    summary:
      "A Product Performance Bot signs in to your observability tool on its cloud computer and compares this week's latency with last week's. When something slowed down, it writes up the likely cause with screenshots.",
    apps: ["Datadog", "GitHub", "Notion", "Slack"],
    schedule: "On request, or as a weekly routine",
    steps: [
      "Opens your dashboards in the computer's browser and pulls the metric you name",
      "Compares it with the previous period",
      "When it regressed, opens the slowest traces and screenshots the flamegraphs",
      "Matches the change to a merged pull request and drafts a one-page writeup",
    ],
    waitsForYou: [
      "Publishing the doc and posting the link wait for your approval; high-risk actions cannot be always allowed",
    ],
  },
  "bug-reproduction": {
    headline: "AI agent for bug reproduction",
    summary:
      "A Bug Reproduction Bot follows a customer's steps on your staging site in its own browser and captures what fails. Engineers get a repro pack with steps, screenshots, and console errors.",
    apps: ["Intercom", "Linear"],
    schedule: "When a conversation is tagged, checked by a routine",
    steps: [
      "Reads the support conversation and the steps the customer took",
      "Follows the same path on your staging site in the computer's browser",
      "Captures screenshots and console errors when it reproduces",
      "Drafts an issue with numbered steps, expected and actual behavior",
    ],
    waitsForYou: [
      "Filing the issue and adding the internal note are app writes, so they wait for your approval unless you always allow them",
    ],
  },
  "account-health": {
    headline: "AI agent for customer account health",
    summary:
      "An Account Health Bot reads usage, CRM, and support signals for every account renewing soon. It ranks the ones that need attention, with one line of reasoning each.",
    apps: ["Salesforce", "Stripe", "Zendesk", "Gmail", "Google Sheets"],
    schedule: "Every Monday, as a routine",
    steps: [
      "Pulls accounts renewing in the next 90 days from your CRM",
      "Checks seat usage, open tickets, and your last email thread for each",
      "Ranks them by churn risk in a sheet with its reasoning",
      "Drafts check-in emails for the accounts most at risk",
    ],
    waitsForYou: [
      "Check-in emails are drafts. You review and send them",
      "Writing the ranking to the sheet waits for your approval unless you always allow it",
    ],
  },
  "chief-of-staff": {
    headline: "AI chief of staff for your inbox and calendar",
    summary:
      "A Chief of Staff Bot reads your unread email, direct messages, and today's calendar every morning, then sends you one brief. It covers the meetings that need prep, the replies due today, and the threads you promised to follow up on.",
    apps: ["Gmail", "Slack", "Google Calendar"],
    schedule: "Every weekday morning, as a routine",
    steps: [
      "Reads unread email, direct messages, and today's meetings",
      "Writes a short brief on each attendee from your past emails",
      "Drafts replies to the emails that need an answer today",
      "Lists threads you said you'd follow up on and haven't",
    ],
    waitsForYou: [
      "Replies stay as drafts in Gmail for you to send",
      "Sending you the brief in Slack needs approval every time, even when the message is only to you",
    ],
  },
  "support-triage": {
    headline: "AI agent for support ticket triage",
    summary:
      "A Support Triage Bot reads new tickets every hour and drafts answers to how-to questions from your help center. It routes billing issues and links real bugs to an existing issue or drafts a new one.",
    apps: ["Zendesk", "Notion", "Linear", "Slack"],
    schedule: "Every hour, as a routine",
    steps: [
      "Reads new tickets since the last run",
      "Drafts replies to how-to questions using your help center",
      "Tags billing issues for your finance team",
      "Searches for an existing bug report and links it, or drafts a new one with repro steps",
    ],
    waitsForYou: [
      "Replies, tags, new issues, and alerts wait for approval unless an eligible rule allows the action; replies and Slack posts always need approval",
    ],
  },
}

// The role pages at /use-cases/[id]. Their ids are public URLs, so keep them
// stable even when the homepage showcase changes.
const roleSummaries = [
  {
    id: "sales-outbound",
    name: "Sales Outbound",
    color: "#54b9a6",
    description:
      "Generate pipeline overnight. Researches accounts, scores contacts by intent, drafts email and LinkedIn in your voice, and leaves a review list for you to approve each morning.",
  },
  {
    id: "talent-scout",
    name: "Talent Scout",
    color: "#885cf5",
    description:
      "Keep your talent pipeline moving. Sources candidates, drafts outreach in your voice, skips anyone already in the ATS, and handles interview scheduling once you approve.",
  },
  {
    id: "paid-media",
    name: "Paid Media",
    color: "#eb4699",
    description:
      "Protect your ad budget. Pulls live channel and campaign data every day, recommends reallocations against your monthly plan, and holds every bid change until you approve it.",
  },
  {
    id: "expense-manager",
    name: "Expense Manager",
    color: "#5bc67a",
    description:
      "Close the week with clean books. Builds the weekly summary from your expense tool and sheets, files receipts from email, and nudges owners on missing categories before review.",
  },
  {
    id: "product-performance",
    name: "Product Performance",
    color: "#ea4045",
    description:
      "Know what slowed down and why. Logs into observability tools, reads the flamegraphs, and comes back with the hot spots and a short writeup with screenshots.",
  },
  {
    id: "bug-reproduction",
    name: "Bug Reproduction",
    color: "#ea4045",
    description:
      "Hand engineers bugs they can reproduce. Picks up the support thread, clicks the same path in staging, captures the failure, and drops a repro pack with steps and screenshots.",
  },
  {
    id: "account-health",
    name: "Account Health",
    color: "#3c82f6",
    description:
      "See risk and expansion before the QBR. Reads usage, CRM, and support signals across your book and ranks the accounts that need attention, with next steps.",
  },
  {
    id: "chief-of-staff",
    name: "Chief of Staff",
    color: "#ed712e",
    description:
      "Keep your week from slipping. Scans Slack, email, calendar, and meeting notes, flags what matches your priorities, and follows up on dropped threads before they go cold.",
  },
]

export const useCases = [
  ...roleSummaries.map(({ id, name, color, description }) => ({
    id,
    name,
    color,
    description,
  })),
  {
    id: "support-triage",
    name: "Support Triage",
    color: "#e5b53a",
    description:
      "Clear the queue before you log on. Triages new tickets, drafts replies grounded in your docs, files real bugs with repro steps, and escalates anything urgent to you.",
  },
].map((useCase) => ({
  ...useCase,
  prompt: prompts[useCase.id],
  ...details[useCase.id],
}))

export type UseCase = (typeof useCases)[number]

export const findUseCase = (id: string) =>
  useCases.find((useCase) => useCase.id === id)
