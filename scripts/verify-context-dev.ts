// Opt-in live check of the context.dev client (lib/context-dev.ts): one real
// call per review source, Instagram, TikTok and a page read. Spends roughly
// 10 to 50 context.dev credits; makes no model calls and writes nothing.
//   pnpm exec tsx --env-file=.env.local scripts/verify-context-dev.ts
import { createContextDevClient } from "../lib/context-dev"

let total = 0
const client = createContextDevClient({
  onUsage: async (credits) => {
    total += credits
  },
})

const reviewPages = [
  "https://apps.apple.com/us/app/notion-notes-tasks-ai/id1232780281",
  "https://play.google.com/store/apps/details?id=notion.id",
  "https://www.g2.com/products/notion/reviews",
  "https://www.yelp.com/biz/tartine-bakery-san-francisco",
  "https://www.google.com/maps/search/?api=1&query=Tartine+Bakery+San+Francisco",
]

function sample(value: unknown) {
  return JSON.stringify(value)?.slice(0, 300)
}

async function main() {
  for (const url of reviewPages) {
    const before = total
    const result = await client.reviews(
      { url, maxRating: 2, limit: 20 },
      { toolCallId: "verify" }
    )
    if (result.status === "failed") {
      console.log(`✖ reviews ${url}\n  ${result.code}: ${result.message}`)
      continue
    }
    const first = result.reviews[0]
    console.log(
      `✔ reviews ${result.source}: fetched ${result.fetched}, ≤2 stars ${result.matching}, returned ${result.returned}, credits ${total - before}`
    )
    console.log(
      `  fields: ${first && typeof first === "object" ? Object.keys(first).join(", ") : "none"}`
    )
    console.log(`  sample: ${sample(first)}`)
    console.log(`  about: ${sample(result.about)}`)
  }

  const social: [string, "overview" | "posts" | "comments"][] = [
    ["https://www.instagram.com/notionhq/", "overview"],
    ["https://www.tiktok.com/@notionhq", "overview"],
    ["https://www.tiktok.com/@notionhq", "posts"],
  ]
  let videoUrl: string | undefined
  for (const [url, view] of social) {
    const before = total
    const result = await client.social({ url, view }, { toolCallId: "verify" })
    if (result.status === "failed") {
      console.log(
        `✖ social ${url} (${view})\n  ${result.code}: ${result.message}`
      )
      continue
    }
    console.log(
      `✔ social ${result.parser}: truncated ${result.truncated}, credits ${total - before}`
    )
    console.log(`  sample: ${sample(result.data)}`)
    const text = JSON.stringify(result.data)
    videoUrl ??= text.match(
      /https:\/\/www\.tiktok\.com\/@[^"/]+\/video\/\d+/
    )?.[0]
  }
  if (videoUrl) {
    const before = total
    const result = await client.social(
      { url: videoUrl, view: "comments" },
      { toolCallId: "verify" }
    )
    console.log(
      result.status === "failed"
        ? `✖ social tiktok-comments\n  ${result.code}: ${result.message}`
        : `✔ social tiktok-comments: credits ${total - before}\n  sample: ${sample(result.data)}`
    )
  } else console.log("- no TikTok video URL found to read comments from")

  const before = total
  const page = await client.read(
    { url: "https://www.reddit.com/r/Notion/" },
    { toolCallId: "verify" }
  )
  console.log(
    page.status === "failed"
      ? `✖ read reddit\n  ${page.code}: ${page.message}`
      : `✔ read reddit: ${page.content.length} chars, truncated ${page.truncated}, credits ${total - before}\n  sample: ${page.content.slice(0, 200).replace(/\s+/g, " ")}`
  )
  console.log(`Total credits: ${total}`)
}

void main()
