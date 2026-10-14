// Uses real Tavily and the chat model; costs a small number of searches/tokens.
// Run: pnpm exec tsx --env-file=.env.local scripts/verify-web-agent.ts
import assert from "node:assert/strict"
import { generateText, isStepCount, type ModelMessage } from "ai"
import { createTavilyClient } from "../lib/tavily"
import { createWebTools } from "../lib/web-tools"
import { webSearchInstructions } from "../lib/web-search-instructions"
import { chatModel } from "../lib/model"
import { botPersonalityInstructions } from "../lib/bot-personality"

assert.ok(
  process.env.TAVILY_API_KEY?.trim(),
  "Configure TAVILY_API_KEY in .env.local first."
)

const client = createTavilyClient()
const direct = await client.search(
  {
    query: "Tavily official API credits pricing basic advanced search",
    includeDomains: ["tavily.com"],
  },
  { toolCallId: "live-search", abortSignal: AbortSignal.timeout(40_000) }
)
assert.equal(
  direct.status,
  "completed",
  direct.status === "failed" ? direct.message : undefined
)
assert.ok(direct.status === "completed" && direct.results.length > 0)
const page = await client.read(
  { url: "https://docs.tavily.com/documentation/api-credits" },
  { toolCallId: "live-read", abortSignal: AbortSignal.timeout(40_000) }
)
assert.equal(
  page.status,
  "completed",
  page.status === "failed" ? page.message : undefined
)
assert.ok(page.status === "completed" && page.content.includes("credit"))
console.log(
  JSON.stringify({
    check: "live search and page extraction",
    passed: true,
    sources: direct.results.length,
    characters: page.content.length,
    searchCredits: direct.credits,
    readCredits: page.credits,
  })
)

const scenarios = [
  {
    name: "current pricing searches, reads and cites",
    prompt:
      "Look up Tavily's current basic versus advanced search pricing. Search for the official pricing, read the official page to verify it, and cite that source. Keep the answer brief.",
    expected: ["searchWeb", "readWebPage"],
    citations: true,
  },
  {
    name: "supplied public URL is read directly",
    prompt:
      "Read https://docs.tavily.com/documentation/api-credits and summarize how basic and advanced search credits differ. Cite that page.",
    expected: ["readWebPage"],
    citations: true,
  },
  {
    name: "editing provided text skips browsing",
    prompt:
      "Rewrite this sentence to be shorter: We are currently in the process of making improvements to our onboarding experience.",
    expected: [],
    citations: false,
  },
]

for (const scenario of scenarios) {
  const calls: { name: string; urls: string[] }[] = []
  const baseTools = createWebTools(client)
  const tools = {
    searchWeb: {
      ...baseTools.searchWeb,
      execute: async (
        ...args: Parameters<NonNullable<typeof baseTools.searchWeb.execute>>
      ) => {
        const output = await baseTools.searchWeb.execute!(...args)
        assert.ok("status" in output)
        assert.equal(output.status, "completed", "Live search should succeed")
        calls.push({
          name: "searchWeb",
          urls:
            output.status === "completed"
              ? output.results.map((source) => source.url)
              : [],
        })
        return output
      },
    },
    readWebPage: {
      ...baseTools.readWebPage,
      execute: async (
        ...args: Parameters<NonNullable<typeof baseTools.readWebPage.execute>>
      ) => {
        const output = await baseTools.readWebPage.execute!(...args)
        assert.ok("status" in output)
        assert.equal(output.status, "completed", "Live reading should succeed")
        calls.push({
          name: "readWebPage",
          urls: output.status === "completed" ? [output.url] : [],
        })
        return output
      },
    },
  }
  const messages: ModelMessage[] = [{ role: "user", content: scenario.prompt }]
  const result = await generateText({
    model: chatModel(messages),
    instructions: [
      `You are a research teammate. Current date (UTC): ${new Date().toISOString().slice(0, 10)}.`,
      botPersonalityInstructions,
      webSearchInstructions(true),
    ].join("\n\n"),
    messages,
    tools,
    stopWhen: isStepCount(6),
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(90_000),
  })
  for (const expected of scenario.expected)
    assert.ok(
      calls.some((call) => call.name === expected),
      `${scenario.name}: expected ${expected}`
    )
  if (scenario.expected.length === 0) assert.equal(calls.length, 0)
  if (scenario.name.includes("directly"))
    assert.equal(calls[0]?.name, "readWebPage")
  assert.ok(result.text.trim(), "Expected a final response")
  if (scenario.citations) {
    const cited = [
      ...result.text.matchAll(/\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/g),
    ].map((match) => match[1])
    assert.ok(
      cited.some((url) => calls.some((call) => call.urls.includes(url))),
      "Expected a citation to a retrieved source"
    )
  }
  console.log(
    JSON.stringify({
      scenario: scenario.name,
      passed: true,
      tools: calls.map((call) => call.name),
      steps: result.steps.length,
    })
  )
}
