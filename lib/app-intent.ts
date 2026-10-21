// Which apps a message's request probably needs, so the bot can show connect
// cards in its first step instead of replying that an app must be connected.
// Pure and deterministic. A hint only: the catalog still checks every card,
// and the bot decides whether the request really needs the app.

export type IntentApp = { toolkit: string; name: string }
export type AppIntent = { need: string; apps: IntentApp[] }

const GMAIL = { toolkit: "gmail", name: "Gmail" }
const OUTLOOK = { toolkit: "outlook", name: "Outlook" }
const GOOGLE_CALENDAR = { toolkit: "googlecalendar", name: "Google Calendar" }
const GOOGLE_SHEETS = { toolkit: "googlesheets", name: "Google Sheets" }
const EXCEL = { toolkit: "excel", name: "Excel" }

// A named service means that app alone. Checked first, so "send it from
// Outlook" offers Outlook rather than every email app.
const BRANDS: [RegExp, IntentApp][] = [
  [/\bg-?mail\b/, GMAIL],
  [/\b(?:outlook|hotmail)\b/, OUTLOOK],
  [/\bgoogle calendar\b|\bgcal\b/, GOOGLE_CALENDAR],
  [/\bgoogle sheets?\b/, GOOGLE_SHEETS],
  [/\bgoogle docs?\b/, { toolkit: "googledocs", name: "Google Docs" }],
  [/\bgoogle drive\b/, { toolkit: "googledrive", name: "Google Drive" }],
  [/\bexcel\b/, EXCEL],
  [/\bslack\b/, { toolkit: "slack", name: "Slack" }],
  [/\bdiscord\b/, { toolkit: "discord", name: "Discord" }],
  [/\bnotion\b/, { toolkit: "notion", name: "Notion" }],
  [/\bgithub\b/, { toolkit: "github", name: "GitHub" }],
  [/\blinear\b/, { toolkit: "linear", name: "Linear" }],
  [/\basana\b/, { toolkit: "asana", name: "Asana" }],
  [/\btodoist\b/, { toolkit: "todoist", name: "Todoist" }],
  [/\bhubspot\b/, { toolkit: "hubspot", name: "HubSpot" }],
  [/\bdropbox\b/, { toolkit: "dropbox", name: "Dropbox" }],
  [/\bzoom\b/, { toolkit: "zoom", name: "Zoom" }],
]

// Work on the person's own accounts, described without a brand. Each phrase
// needs an action or a possessive, so a passing mention ("my email address is
// x") doesn't count.
const NEEDS: { need: string; pattern: RegExp; apps: IntentApp[] }[] = [
  {
    need: "email",
    pattern:
      /\b(?:(?:send|write|draft|compose|forward|reply|respond|answer|shoot|fire off)\b[^.?!\n]{0,40}\be-?mails?\b|e-?mail (?:him|her|them|this|that|these|those|it|my|the|a|an|everyone|everybody|people|someone|back)\b|e-?mail (?!address|addresses|signature|account)[a-z]+(?: (?:about|to|that|and)\b|\s*[.?!]?$)|e-?mail \S+@\S+|(?:my|our|the) (?:inbox|mailbox|unread)\b|(?:new|recent|latest|unread|last|today's) e-?mails?\b|(?:check|read|search|summari[sz]e|go through|clean up|sort|triage|find|look (?:at|through))\b[^.?!\n]{0,30}\be-?mails?\b(?! address| signature)|e-?mails? (?:from|to) \S+)/,
    apps: [GMAIL, OUTLOOK],
  },
  {
    need: "a calendar",
    pattern:
      /\b(?:(?:my|our|the|a) calendar|(?:schedule|book|set up|arrange|move|reschedule|cancel|add) (?:a |an |the |my |our )?(?:meeting|call|appointment|event|invite)|(?:send|create) (?:a |an |the )?(?:calendar )?invite|(?:am i|are we) free\b|my (?:schedule|availability|meetings|events)\b|what(?:'s| is) on my (?:day|week|schedule))/,
    apps: [GOOGLE_CALENDAR, OUTLOOK],
  },
  {
    need: "a spreadsheet",
    pattern: /\b(?:my|our|the|a|this|that|in a|into a) spreadsheets?\b/,
    apps: [GOOGLE_SHEETS, EXCEL],
  },
]

export function appIntent(text: string): AppIntent | undefined {
  const value = text.toLowerCase().replace(/[’‘]/g, "'").slice(0, 2000)
  if (!value.trim()) return undefined
  const named = BRANDS.filter(([pattern]) => pattern.test(value)).map(
    ([, app]) => app
  )
  if (named.length)
    return {
      need: named.map((app) => app.name).join(" and "),
      apps: named.slice(0, 3),
    }
  const match = NEEDS.find(({ pattern }) => pattern.test(value))
  return match && { need: match.need, apps: match.apps }
}

// The turn's instruction, or nothing when an app that covers the need is
// already connected (then the bot uses searchAppTools as usual).
export function appIntentInstructions(
  intent: AppIntent | undefined,
  connected: ReadonlySet<string>
) {
  if (!intent || intent.apps.some((app) => connected.has(app.toolkit)))
    return undefined
  const cards = JSON.stringify(intent.apps)
  const names = intent.apps.map((app) => app.name).join(" or ")
  return [
    `Connection check for the latest message: it looks like it needs ${intent.need}, and the person has no ${names} connection.`,
    `If the request really needs ${intent.need} (not just a mention of it), make your first tool call askUser with appConnections: ${cards}, and a question saying what you'll do once connected (for example 'Connect your email so I can send this to Sam.'). This shows a connect card for each app, so the person can pick the one they use. Don't call findApps or searchAppTools first, don't reply in text that they need to connect something, and don't ask which app they use: the cards ask that.`,
    "If askUser says one of these apps is already connected, use searchAppTools instead. If it refuses every card, fall back to findApps or the computer as usual. If the request doesn't need these apps, ignore this check.",
  ].join(" ")
}
