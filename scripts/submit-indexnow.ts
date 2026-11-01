// Tells IndexNow search engines (Bing and others) that the public pages
// changed. Run after a release that changes marketing pages:
//
//   pnpm exec tsx scripts/submit-indexnow.ts           # submit
//   pnpm exec tsx scripts/submit-indexnow.ts --dry-run # list the URLs only
//
// It submits the sitemap plus the plain-text files for AI assistants, and only
// after checking that production serves the key file, because IndexNow rejects
// a submission it can't verify. Needs no environment variables.

import sitemap from "@/app/sitemap"
import { indexNowEndpoint, indexNowKey, indexNowPayload } from "@/lib/indexnow"
import { absoluteUrl } from "@/lib/marketing/content"
import { siteUrl } from "@/lib/marketing/site"

const dryRun = process.argv.includes("--dry-run")

const urls = [
  ...sitemap().map((entry) => entry.url),
  absoluteUrl("/llms.txt"),
  absoluteUrl("/llms-full.txt"),
  absoluteUrl("/pricing.md"),
]
const payload = indexNowPayload(siteUrl, urls)

if (dryRun) {
  console.log(payload.urlList.join("\n"))
  console.log(`\n${payload.urlList.length} URLs, key at ${payload.keyLocation}`)
  process.exit(0)
}

const keyFile = await fetch(payload.keyLocation)
const served = keyFile.ok ? (await keyFile.text()).trim() : ""
if (served !== indexNowKey) {
  console.error(
    `${payload.keyLocation} answered ${keyFile.status} without the key. Deploy public/${indexNowKey}.txt first.`
  )
  process.exit(1)
}

const response = await fetch(indexNowEndpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(payload),
})
// 200 means accepted, 202 means accepted while the key is still being checked.
if (response.status === 200 || response.status === 202) {
  console.log(
    `Submitted ${payload.urlList.length} URLs (HTTP ${response.status}).`
  )
} else {
  console.error(
    `IndexNow answered ${response.status}: ${(await response.text()).slice(0, 500)}`
  )
  process.exit(1)
}
