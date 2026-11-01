// Points the Composio project's webhook subscription at Krafty, for event
// routines (lib/routine-events.ts), and saves its signing secret to
// .env.local as COMPOSIO_WEBHOOK_SECRET. Never prints the secret. Then copy
// it to Railway production (the README's Environment section).
//
//   pnpm exec tsx --env-file=.env.local scripts/setup-composio-webhook.ts [url]
//
// The project has one subscription; running this again updates it in place.
import { readFileSync, writeFileSync } from "node:fs"

import { Composio } from "@composio/core"

const url = process.argv[2] ?? "https://kraftybot.app/api/webhooks/composio"
const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY })

const subscription = await composio.webhooks.subscriptions.set({
  webhookUrl: url,
  enabledEvents: ["composio.trigger.message"],
  version: "V3",
})
const secret =
  subscription.secret ??
  (await composio.webhooks.subscriptions.get(subscription.id)).secret
if (!secret) throw new Error("Composio returned no signing secret")

const file = ".env.local"
const lines = readFileSync(file, "utf8").split("\n")
const line = `COMPOSIO_WEBHOOK_SECRET=${secret}`
const at = lines.findIndex((entry) =>
  entry.startsWith("COMPOSIO_WEBHOOK_SECRET=")
)
if (at === -1) lines.splice(lines.at(-1) === "" ? -1 : lines.length, 0, line)
else lines[at] = line
writeFileSync(file, lines.join("\n"))

console.log(
  JSON.stringify({
    id: subscription.id,
    webhookUrl: subscription.webhookUrl,
    version: subscription.version,
    enabledEvents: subscription.enabledEvents,
    secretSavedTo: file,
  })
)
