// Guide copy for the role pages at /use-cases/[id]: a first run, an example of
// what comes back, questions for that role, and where the job goes wrong.
// Everything here follows from the starter prompt in use-cases-data.ts and the
// approval rules in docs/autonomy.md ("What is enforced"). Reads need no
// approval; every write to a connected app waits for the person unless they
// always allow that action for that Bot. Sample outputs are fictional.

export type UseCaseGuide = {
  /** 3 to 5 numbered steps for a person's first run, second person, present tense, each one sentence. */
  firstRun: readonly string[]
  /** An example of what the Bot hands back. Clearly fictional; `label` must say it is an example. */
  sampleOutput: { label: string; title: string; lines: readonly string[] }
  /** 4 role-specific questions and answers, each answer 40 to 70 words, plain, honest. */
  faqs: readonly (readonly [question: string, answer: string])[]
  /** 2 or 3 sentences on where this job goes wrong and what the Bot does about it (be honest about limits). */
  pitfalls: string
}

const exampleLabel = "Example output. Not real data."

export const useCaseGuides: Record<string, UseCaseGuide> = {
  "sales-outbound": {
    firstRun: [
      "Create a Bot, paste the starter prompt, and answer its setup questions.",
      "Connect HubSpot, Gmail, Google Sheets, and Slack when it asks.",
      "Run it once by hand and read the ranked list it writes.",
      "Approve the sheet write and the Slack message; sending messages needs approval each time.",
      "Ask it to repeat the job every weeknight, and it saves the routine.",
    ],
    sampleOutput: {
      label: exampleLabel,
      title: "Top accounts, Tuesday run",
      lines: [
        "1. Northwind Logistics. Hiring three platform engineers. VP Engineering: Jordan, jordan@northwind.example",
        "2. Acme Freight. Funding round announced last week. VP Engineering: Sam, sam@acme.example",
        "3. Example Co. Careers page mentions a Kubernetes migration. Contact unconfirmed, needs your check",
        "Drafts for all three are in Gmail. Nothing has been sent.",
      ],
    },
    faqs: [
      [
        "Will it email anyone?",
        "No. The starter prompt ends with a plain instruction not to send anything, and the Bot follows it. It writes drafts in Gmail in the voice it picks up from your sent mail and leaves them there. Sending is a step you take yourself, after reading each draft.",
      ],
      [
        "What if HubSpot isn't connected?",
        "The Bot asks you to connect it on the first run and waits. You sign in to HubSpot yourself, and you can disconnect it later from your account. The free plan includes one connected app, so this prompt, which names four, needs the Pro plan.",
      ],
      [
        "How long does a nightly run take?",
        "It depends on how many target companies qualify and how much reading each one needs. Ten accounts with a careers page and a news check is a long turn. A run can also stop early at your AI allowance or the step limit, and then the Bot says how far it got.",
      ],
      [
        "Can it run while I'm asleep?",
        "Yes. A routine runs at 2am in your timezone whether or not your browser is open. If the sheet write or the Slack message needs approval, the request waits on your Activity page for up to seven days, and the Bot picks up again when you decide.",
      ],
    ],
    pitfalls:
      "Duplicate companies in your CRM show up twice in the ranking, and a contact the Bot finds on the web may have moved on, so treat each name as a lead to check rather than a fact. When a careers page blocks the computer's browser or the news is thin, the Bot says the signal is weak instead of inventing one.",
  },

  "talent-scout": {
    firstRun: [
      "Create a Bot, paste the prompt, and describe the role in your own words when it asks.",
      "Connect Greenhouse, Google Sheets, Gmail, and Google Calendar when prompted.",
      "Read the sheet it builds and remove anyone who doesn't fit.",
      "Approve each note before it goes out, and approve the calendar offers.",
    ],
    sampleOutput: {
      label: exampleLabel,
      title: "Candidate list, first pass",
      lines: [
        "Row 1: Senior infrastructure engineer at Northwind (Series C). Fit: led a Kubernetes migration, per a public talk. Note drafted.",
        "Row 2: Staff engineer at Acme Cloud (Series B). Fit: open-source work on service meshes. Note drafted.",
        "Row 3: Skipped. Already in Greenhouse as an active application.",
        "Twelve more rows below. No notes sent yet.",
      ],
    },
    faqs: [
      [
        "Does it email candidates on its own?",
        "Not without you. The prompt says to send only once you approve, and Krafty holds each Gmail send until you decide. Sending email is a high-risk action, so it cannot be always allowed, even after you have reviewed several successful runs.",
      ],
      [
        "Where does it find people?",
        "On the web, with searches that count against your plan's allowance, and in the computer's browser for sites without a connection. It reads public profiles, talks, and code, then checks Greenhouse so it skips anyone already in process. It can't see private profiles or anything behind a login you haven't given it.",
      ],
      [
        "What if a site asks for a code to sign in?",
        "The Bot can't get past a two-factor prompt on its own and doesn't try. It tells you in the chat, and you sign in on the shared computer yourself. The sign-in carries over to later runs, since every Bot on your account uses the same computer.",
      ],
      [
        "Can it book the interviews too?",
        "It reads your Google Calendar freely to find three open slots and offers them in the note. Creating an event is a write to a connected app, so it waits for your approval the way the email did. It doesn't go back and forth on times unless you ask it to.",
      ],
    ],
    pitfalls:
      "Public pages go stale, so a title may be old and a person may already have moved on; the sheet is a starting list, not a verified one. Someone who is in Greenhouse under a different email can slip past the skip check. Fifteen well-researched people is a long run, and when it stops at your usage allowance the Bot hands back the rows it finished.",
  },

  "paid-media": {
    firstRun: [
      "Create a Bot and paste the prompt with your own channel name and sheet name.",
      "Connect Google Ads, Meta Ads, Google Sheets, and Slack when it asks.",
      "Run it by hand once and compare the summary with the numbers in each ad account.",
      "Approve the Slack post when the morning summary is ready; posting needs approval each time.",
      "Say yes to the schedule and it saves an 8am routine in your timezone.",
    ],
    sampleOutput: {
      label: exampleLabel,
      title: "Yesterday in #growth",
      lines: [
        "Spend: $1,240 across both accounts, 4% under the daily plan in Ad Plan.",
        "CTR: Search 3.1%, Meta prospecting 0.9%.",
        "Conversions: 38, up from 31 the day before.",
        "Watch: Acme retargeting has been above target CPA for three days. Suggested move: shift $150 a day to Search brand. Waiting for your OK.",
      ],
    },
    faqs: [
      [
        "Will it change my bids or budgets?",
        "No. Any change to a campaign is a write to a connected app, so it is held until you approve it, and the prompt tells the Bot to wait for your OK on top of that. It recommends one specific move with the reason, and you accept or decline on the card.",
      ],
      [
        "Why does the Slack post need approval?",
        "Posting a message is an app write, and sending or posting is high-risk under Krafty's policy. That means the Slack summary needs your approval every morning and cannot be always allowed. Ask for the summary in the Bot's chat instead if you want to read it without approving a Slack post.",
      ],
      [
        "What if the numbers look wrong?",
        "Tell the Bot in the chat and it re-reads the accounts. It reports what the ad platforms return and compares that with your sheet; it doesn't correct attribution or repair a tracking gap. Keep the budget sheet current, because a stale plan produces a confident but useless comparison.",
      ],
      [
        "Can it run on weekends?",
        "Yes. A daily routine takes the days you choose, so run it every day or on weekdays only. Each run is a separate turn that spends from your AI allowance, and a run can stop early if the allowance runs out before the summary is written.",
      ],
    ],
    pitfalls:
      "Ad platforms often revise yesterday's figures later in the day, so an 8am summary can differ from what you see at noon. A campaign renamed in one place and not in the sheet leaves the Bot comparing the wrong rows. It says when it couldn't match a campaign rather than guessing.",
  },

  "expense-manager": {
    firstRun: [
      "Create a Bot, paste the prompt, and tell it the names of your receipts folder and expense sheet.",
      "Connect Gmail, Google Drive, Google Sheets, and Slack when it asks.",
      "Run it once for the current week and check a few rows against the original emails.",
      "Approve the file saves and sheet writes, then decide which ones to always allow.",
      "Ask for the Friday schedule and it saves the routine.",
    ],
    sampleOutput: {
      label: exampleLabel,
      title: "Week of 20 October, logged",
      lines: [
        "Northwind Hosting, $89.00, 21 Oct, Infrastructure. Saved to Receipts 2026.",
        "Acme Travel, $642.50, 22 Oct, Travel. Flagged: over $500.",
        "Example Co Consulting, $300.00, 23 Oct, category unclear. Flagged: DM to the spender drafted, waiting for your approval.",
        "Three receipts matched. One email looked like a receipt but had no amount, so it was skipped.",
      ],
    },
    faqs: [
      [
        "Will it message my teammates without asking?",
        "No. A Slack direct message is a send, so it needs your approval every time and cannot be always allowed. The Bot can prepare the reminder while it reviews the receipts, but it must wait before sending it. Anything over $500 is still flagged for your review.",
      ],
      [
        "How does it pick a category?",
        "From the vendor, the line items in the email, and the categories already in your sheet. When nothing fits, it writes category unclear and flags the row rather than inventing one. Put your category list in its working instructions and the guesses get better.",
      ],
      [
        "What about receipts that aren't in Gmail?",
        "This prompt reads only your Gmail. A receipt that lives on a vendor's site can be fetched in the computer's browser if you ask and sign in there, but that's a separate job. Paper receipts and other inboxes aren't covered by this one.",
      ],
      [
        "Can it run while my laptop is closed?",
        "Yes. The Friday routine runs on Krafty's side at 4pm in your timezone. Writes that need approval wait on your Activity page for up to seven days, and the Bot continues once you decide. If you decline one, it reports what it skipped.",
      ],
    ],
    pitfalls:
      "The same purchase can arrive as an order confirmation and again as an invoice, and both look like receipts, so check for duplicates in the first weeks. Amounts in another currency are logged as written, not converted. A PDF sent as a link rather than an attachment may not download.",
  },

  "product-performance": {
    firstRun: [
      "Create a Bot, paste the prompt, and name the service and metric you care about.",
      "Connect GitHub, Notion, and Slack when it asks, and sign in to Datadog on the shared computer yourself.",
      "Run it once by hand and read the comparison before trusting a schedule.",
      "Approve the Notion doc and the Slack post when it's ready.",
    ],
    sampleOutput: {
      label: exampleLabel,
      title: "Checkout p95, week over week",
      lines: [
        "p95 latency: 840ms this week, 610ms last week, up 38%.",
        "Slowest traces: three screenshots attached, all in the pricing lookup span.",
        "Likely cause: example-co/web PR #412, merged Tuesday, added a second pricing fetch.",
        "Draft doc: Checkout latency, week 43. Not published yet.",
      ],
    },
    faqs: [
      [
        "Does it need a Datadog integration?",
        "No. The Bot signs in to Datadog in the browser on your account's cloud computer, the way a person would. Sign in there once yourself, and the session carries over to later runs. A separate model checks each click against a screenshot, and anything that would change a setting is held.",
      ],
      [
        "How does it match a regression to a pull request?",
        "It reads merged pull requests in GitHub from around the time the metric moved and looks for changes on the same code path. That's a likely cause, not proof, and the writeup says so. It doesn't run the code, profile it, or revert anything.",
      ],
      [
        "What if nothing slowed down?",
        "Then the Bot reports the two numbers and stops. The prompt asks for traces and a writeup only when p95 rose more than 20%. Lower the threshold if you want more investigations, or ask for the plain comparison every week regardless.",
      ],
      [
        "Can it change dashboards or alerts?",
        "Not by itself. A click that commits a change, such as saving a monitor, needs your approval first, and the guard that reads the screen fails closed when it can't tell what a button does. This job is reading and screenshots. Ask it to change something and it asks you.",
      ],
    ],
    pitfalls:
      "Dashboards paginate and load lazily, so a screenshot can miss the slowest trace when the page hasn't finished rendering. A deploy that bundles several pull requests makes the match ambiguous, and the Bot lists the candidates rather than picking one. A two-factor prompt on Datadog stops the run until you sign in.",
  },

  "bug-reproduction": {
    firstRun: [
      "Create a Bot, paste the prompt, and give it your staging URL and a test login.",
      "Connect Intercom and Linear when it asks.",
      "Tag one old conversation as a bug and run the Bot by hand to watch it work.",
      "Approve the Linear issue and the Intercom note, then set a routine to check for new tags.",
    ],
    sampleOutput: {
      label: exampleLabel,
      title: "Repro: checkout button does nothing on Safari",
      lines: [
        "Reproduced on staging.example with the customer's steps.",
        "Steps: 1. Add two items. 2. Open the cart. 3. Tap Checkout. Expected: payment page. Actual: button greys out.",
        "Console: TypeError: cart.total is undefined (screenshot attached).",
        "Customer: Northwind, Team plan. Draft issue for Web, waiting for approval.",
      ],
    },
    faqs: [
      [
        "Does it see new bug tags right away?",
        "Not instantly. Krafty has no event triggers yet, so a routine checks Intercom on a schedule, at most once an hour, and picks up tags added since the last check. Mention a conversation in the chat and the Bot starts on it straight away.",
      ],
      [
        "What if it can't reproduce the bug?",
        "It says so. The prompt asks for an internal note either way, so you get a note listing what it tried and where staging behaved differently from the customer's description. It doesn't file a Linear issue for a bug it never saw.",
      ],
      [
        "Could it change data on staging?",
        "Following a customer's steps often means pressing Submit, and clicks that commit something are checked by a separate model and held for your approval. Reads, scrolls, and screenshots run freely. Give it a test account rather than a real one, because staging is still your data.",
      ],
      [
        "Will it reply to the customer?",
        "No. The prompt asks for internal notes, which the customer doesn't see, and even that is an app write that waits for your approval. A reply in the thread would be another app write, and it isn't part of this job unless you add it.",
      ],
    ],
    pitfalls:
      "Bugs that depend on a particular account, device, or cached state often don't reproduce in a clean browser, and the Bot reports that rather than filing a guess. Staging that lags production can hide the bug or show a different one. A console error that scrolls past can be missed, so check the screenshots.",
  },

  "account-health": {
    firstRun: [
      "Create a Bot, paste the prompt, and tell it which Salesforce field holds the renewal date.",
      "Connect Salesforce, Stripe, Zendesk, Gmail, and Google Sheets when it asks.",
      "Run it once and read the reasoning column before you trust the ranking.",
      "Approve the sheet write, and read the five drafts in Gmail.",
      "Ask for the Monday schedule and it saves the routine.",
    ],
    sampleOutput: {
      label: exampleLabel,
      title: "Renewals, next 90 days",
      lines: [
        "1. Northwind. Risk: high. 12 of 40 seats used in Stripe, two open tickets, last email unanswered for three weeks. Draft written.",
        "2. Acme Labs. Risk: medium. Usage steady, one ticket about an export bug. Draft written.",
        "3. Example Co. Risk: low. All seats active, no tickets, renewed early last year.",
        "Fourteen accounts ranked. Drafts for the top five are in Gmail, unsent.",
      ],
    },
    faqs: [
      [
        "Are the check-in emails sent?",
        "No. They are saved as drafts in your Gmail, and the prompt stops there. You read each one, change what you want, and send it yourself. Nothing in this job sends mail, and Krafty would hold a send for your approval in any case.",
      ],
      [
        "What does churn risk mean here?",
        "A ranking the Bot makes from the signals it read: seat usage in Stripe, open tickets in Zendesk, and how your last email thread ended. It's one line of reasoning per account, not a model trained on your churn history. Treat it as a reading order, not a verdict.",
      ],
      [
        "Does it need all five apps?",
        "The prompt names five, and the free plan includes one connected app, so this job needs Pro. You can drop a source and the Bot ranks on what's left, with less to go on. Each app is connected by you and can be disconnected later.",
      ],
      [
        "How long does a Monday run take?",
        "Longer than most, because each account means several reads. The run can stop at your AI allowance or the step limit, and when it does the Bot writes what it finished and says where it stopped. Try a smaller window first, say 30 days.",
      ],
    ],
    pitfalls:
      "Accounts that exist under different names in Salesforce and Stripe don't line up, and the Bot flags the mismatch rather than guessing. Seat counts show adoption, not sentiment, so a quiet account can rank as fine while a loud one looks worse than it is. An old thread in Gmail may be with a contact who has left.",
  },

  "chief-of-staff": {
    firstRun: [
      "Create a Bot and paste the prompt, changing the time to when you start your day.",
      "Connect Gmail, Slack, and Google Calendar when it asks.",
      "Run it by hand once and tell it what belongs in the brief and what doesn't.",
      "Approve the Slack message each morning, or ask for the brief only in the Bot's chat.",
    ],
    sampleOutput: {
      label: exampleLabel,
      title: "Tuesday brief",
      lines: [
        "Prep: 10am with Northwind. Jordan, their ops lead, asked about SSO twice in past emails. The last thread ended with you promising a timeline.",
        "Reply today: Acme contract question, draft in Gmail. Example Co intro from Sam, draft in Gmail.",
        "Promised, not done: you said you'd send the deck to the Acme team on Thursday.",
      ],
    },
    faqs: [
      [
        "Does it read everything in my inbox?",
        "It reads what the prompt names: unread Gmail, Slack DMs, and today's calendar, plus past threads with today's attendees for the attendee notes. Reading needs no approval. The brief lives in the chat and the Slack message, and the Bot remembers only what you ask it to save.",
      ],
      [
        "Will it reply to anyone for me?",
        "No. Replies are drafts in Gmail that wait for you, and the only message this prompt asks it to send is your Slack brief. Sending or posting is high-risk, so that brief needs your approval each time and cannot be always allowed. Nothing goes to anyone else.",
      ],
      [
        "What counts as a promise I haven't kept?",
        "A thread where you wrote that you'd do something and no later message shows it done. The Bot reads the words, so a task you finished outside email still shows up. Tell it in the chat and it drops the item; ask it to remember, and it saves a note.",
      ],
      [
        "Can I get the brief somewhere other than Slack?",
        "The prompt uses Slack, but the Bot can post the brief in its chat instead, which needs no connected app or approval. Emailing it to yourself is a Gmail write and would wait for approval each day. Change the prompt and run it once to check.",
      ],
    ],
    pitfalls:
      "A busy inbox makes for a long brief, and the Bot can run out of steps before the last section, so start with a narrower window than all unread mail. Attendee notes come from past emails only, so a first-time attendee gets a thin one. Calendar invites without a description give it little to prepare.",
  },

  "support-triage": {
    firstRun: [
      "Create a Bot, paste the prompt, and point it at the Notion pages that make up your help center.",
      "Connect Zendesk, Notion, Linear, and Slack when it asks.",
      "Run it by hand on today's tickets and read every draft before anything goes out.",
      "Decide which actions to always allow, such as tagging, and keep replies on approval.",
      "Ask for the hourly schedule and it saves the routine.",
    ],
    sampleOutput: {
      label: exampleLabel,
      title: "Tickets since 9am",
      lines: [
        "#4821 How do I export my data? Draft reply from the Exports help page, waiting for approval.",
        "#4822 Charged twice this month. Tagged billing for finance.",
        "#4823 Dashboard blank after login. Matches Linear WEB-310, link added to the draft. Not urgent.",
        "#4824 Can't log in at all, enterprise customer. Post in #support tagging you, pending approval.",
      ],
    },
    faqs: [
      [
        "Does it answer customers on its own?",
        "No. Every customer reply is held until you approve it. Replying is a high-risk action, so you cannot always allow how-to replies even after successful runs. The Bot can prepare an answer from your help center, but you still review it before it goes out.",
      ],
      [
        "What if the help center has no answer?",
        "The Bot doesn't make one up. It says the help center doesn't cover the question and leaves the ticket for a person, or asks you in the chat. Keeping the Notion pages current is the single biggest thing that improves its drafts.",
      ],
      [
        "How does it decide a ticket is a bug?",
        "From the words in the ticket, something not working as documented, and a search of Linear for an existing issue. It links what it finds or drafts a new issue with the steps the customer gave. It doesn't reproduce the bug in this job; put it in a group chat with a Bug Reproduction Bot for that.",
      ],
      [
        "Does hourly mean it's always running?",
        "No. A routine wakes the Bot once an hour, in your timezone, and each run reads only the tickets since the last one. Between runs nothing happens. Each run spends from your AI allowance, so a quiet hour costs little and a busy one more.",
      ],
    ],
    pitfalls:
      "A ticket that is a billing question and a bug at once can land in the wrong bucket, so check the tags during the first days. A customer writing in a language the help center doesn't cover may get a weaker draft. Urgent Slack alerts still need approval each time, so do not rely on this routine as your only incident notification channel.",
  },
}
