import assert from "node:assert/strict"
import test from "node:test"
import { createFirecrawlClient } from "../lib/firecrawl"
import { createTavilyClient, webPageSchema } from "../lib/tavily"
import { createWebTools } from "../lib/web-tools"

const context = { toolCallId: "web-call", messages: [], context: {} }
const url = "https://www.example.com/texas-businesses-for-sale/"
const scraped = {
  success: true,
  data: {
    markdown: "Cash Flow: $100,000",
    metadata: { url, sourceURL: url, statusCode: 200 },
  },
}

test("reads go to Firecrawl's fixed API, server-authenticated and free", async () => {
  const client = createFirecrawlClient({
    apiKey: "private-firecrawl-key",
    fetch: async (target, options) => {
      assert.equal(target, "https://api.firecrawl.dev/v2/scrape")
      assert.equal(options?.method, "POST")
      assert.equal(
        new Headers(options?.headers).get("Authorization"),
        "Bearer private-firecrawl-key"
      )
      const body = JSON.parse(String(options?.body))
      assert.equal(body.url, url)
      assert.deepEqual(body.formats, ["markdown"])
      assert.equal(body.onlyMainContent, true)
      return Response.json({
        ...scraped,
        data: { ...scraped.data, markdown: "x".repeat(30_000) },
      })
    },
  })
  const result = await client.read({ url }, {})
  assert.equal(result.status, "completed")
  if (result.status === "completed") {
    assert.equal(result.url, url)
    assert.equal(result.content.length, 20_000)
    assert.equal(result.truncated, true)
    assert.equal(result.excerptsOnly, false)
    assert.equal(result.credits, 0)
  }
})

test("readWebPage uses Firecrawl first and never charges for its reads", async () => {
  let tavilyCalls = 0
  const tools = createWebTools(
    createTavilyClient({
      apiKey: "test",
      fetch: async () => {
        tavilyCalls++
        throw new Error("Tavily should not be called")
      },
    }),
    createFirecrawlClient({
      apiKey: "test",
      fetch: async () => Response.json(scraped),
    })
  )
  const result = await tools.readWebPage.execute!(
    webPageSchema.parse({ url }),
    context
  )
  assert.ok("status" in result)
  assert.equal(result.status, "completed")
  if (result.status === "completed")
    assert.equal(result.content, "Cash Flow: $100,000")
  assert.equal(tavilyCalls, 0)
})

test("a failed Firecrawl read falls back to Tavily", async () => {
  const charged: number[] = []
  const tools = createWebTools(
    createTavilyClient({
      apiKey: "test",
      onUsage: async (credits) => {
        charged.push(credits)
      },
      fetch: async () =>
        Response.json({
          results: [{ url, raw_content: "From Tavily" }],
          failed_results: [],
          usage: { credits: 1 },
        }),
    }),
    createFirecrawlClient({
      apiKey: "test",
      fetch: async () => new Response("blocked", { status: 500 }),
    })
  )
  const result = await tools.readWebPage.execute!(
    webPageSchema.parse({ url }),
    context
  )
  assert.ok("status" in result)
  assert.equal(result.status, "completed")
  if (result.status === "completed") assert.equal(result.content, "From Tavily")
  assert.deepEqual(charged, [1])
})

test("blocked, blank and malformed pages are not successful reads", async () => {
  for (const [response, code] of [
    [
      Response.json({
        ...scraped,
        data: { ...scraped.data, metadata: { statusCode: 403 } },
      }),
      "EXTRACTION_FAILED",
    ],
    [
      Response.json({ success: true, data: { markdown: " " } }),
      "EXTRACTION_FAILED",
    ],
    [Response.json({ success: false }), "EXTRACTION_FAILED"],
    [Response.json({ data: "nope" }), "INVALID_RESPONSE"],
    [new Response("no", { status: 401 }), "AUTH_ERROR"],
    [new Response("no", { status: 402 }), "PROVIDER_LIMIT"],
    [new Response("no", { status: 429 }), "RATE_LIMIT"],
  ] as const) {
    const client = createFirecrawlClient({
      apiKey: "private-firecrawl-key",
      fetch: async () => response,
    })
    const result = await client.read({ url }, {})
    assert.equal(result.status, "failed")
    if (result.status === "failed") assert.equal(result.code, code)
    assert.ok(!JSON.stringify(result).includes("private-firecrawl-key"))
  }
})

test("a redirect to a nonpublic URL is cited as the requested URL", async () => {
  const client = createFirecrawlClient({
    apiKey: "test",
    fetch: async () =>
      Response.json({
        ...scraped,
        data: {
          ...scraped.data,
          metadata: { url: "http://localhost:8080/admin", statusCode: 200 },
        },
      }),
  })
  const result = await client.read({ url }, {})
  assert.equal(result.status, "completed")
  if (result.status === "completed") assert.equal(result.url, url)
})

test("each turn has a cap on Firecrawl reads", async () => {
  let calls = 0
  const client = createFirecrawlClient({
    apiKey: "test",
    maxReads: 2,
    fetch: async () => {
      calls++
      return Response.json(scraped)
    },
  })
  const results = [
    await client.read({ url }, {}),
    await client.read({ url }, {}),
    await client.read({ url }, {}),
  ]
  assert.deepEqual(
    results.map((result) => result.status),
    ["completed", "completed", "failed"]
  )
  assert.equal(calls, 2)
})

test("stop cancels a read instead of returning a failure", async () => {
  const controller = new AbortController()
  const client = createFirecrawlClient({
    apiKey: "test",
    fetch: async (_target, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () =>
          reject(options.signal?.reason)
        )
        controller.abort(new Error("stopped"))
      }),
  })
  await assert.rejects(
    client.read({ url }, { abortSignal: controller.signal }),
    /stopped/
  )
})

test("without a key, reads report that Firecrawl is not configured", async () => {
  const client = createFirecrawlClient({ apiKey: "" })
  const result = await client.read({ url }, {})
  assert.equal(result.status, "failed")
  if (result.status === "failed") assert.equal(result.code, "NOT_CONFIGURED")
})
