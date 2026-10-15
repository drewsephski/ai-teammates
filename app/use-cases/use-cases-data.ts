import { roles } from "@/components/landing/bot/role-showcase-data"

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

export const useCases = [
  ...roles.map(({ id, name, color, description }) => ({
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
].map((useCase) => ({ ...useCase, prompt: prompts[useCase.id] }))
