import assert from "node:assert/strict"
import test from "node:test"
import {
  createTavilyClient,
  publicWebUrlSchema,
  tavilyCost,
  webPageSchema,
  webSearchSchema,
} from "../lib/tavily"
import { createWebTools } from "../lib/web-tools"
import { webSearchInstructions } from "../lib/web-search-instructions"

const context = { toolCallId: "web-call", messages: [], context: {} }
const source = {
  title: "Official docs",
  url: "https://example.com/docs",
  content: "Verified source text",
  score: 0.95,
  published_date: "2026-10-13",
}
const searchData = { results: [source], usage: { credits: 1 } }

test("search uses bounded defaults, explicit pricing and server-only authentication", async () => {
  const charged: [number, string][] = []
  const tools = createWebTools(
    createTavilyClient({
      apiKey: "private-test-key",
      beforeRequest: async (credits) => {
        assert.equal(credits, 1)
      },
      onUsage: async (credits, callId) => {
        charged.push([credits, callId])
      },
      fetch: async (url, options) => {
        assert.equal(url, "https://api.tavily.com/search")
        assert.equal(options?.method, "POST")
        assert.equal(
          new Headers(options?.headers).get("Authorization"),
          "Bearer private-test-key"
        )
        assert.deepEqual(JSON.parse(String(options?.body)), {
          query: "Latest docs",
          max_results: 5,
          search_depth: "basic",
          topic: "general",
          include_published_date: true,
          filter_by_published_date: false,
          include_answer: false,
          include_raw_content: false,
          auto_parameters: false,
          include_usage: true,
        })
        return Response.json(searchData)
      },
    })
  )
  const result = await tools.searchWeb.execute!(
    webSearchSchema.parse({ query: " Latest docs " }),
    context
  )
  assert.ok("status" in result)
  assert.equal(result.status, "completed")
  if (result.status === "completed") {
    assert.equal(result.results[0].publishedDate, "2026-10-13")
    assert.equal(result.results[0].url, source.url)
    assert.equal(result.results[0].content, source.content)
  }
  assert.deepEqual(charged, [[1, "web-call"]])
  assert.ok(!JSON.stringify(result).includes("private-test-key"))
  assert.equal(tavilyCost(0.2), 1600)
})

test("advanced search maps news, freshness, date and domain filters", async () => {
  const client = createTavilyClient({
    apiKey: "test",
    fetch: async (_url, options) => {
      const body = JSON.parse(String(options?.body))
      assert.equal(body.search_depth, "advanced")
      assert.equal(body.topic, "news")
      assert.equal(body.time_range, "week")
      assert.equal(body.start_date, "2026-10-01")
      assert.equal(body.end_date, "2026-10-13")
      assert.equal(body.filter_by_published_date, true)
      assert.deepEqual(body.include_domains, ["example.com"])
      assert.deepEqual(body.exclude_domains, ["other.example.com"])
      return Response.json({ ...searchData, usage: { credits: 2 } })
    },
  })
  await client.search(
    {
      query: "News",
      depth: "advanced",
      topic: "news",
      timeRange: "week",
      startDate: "2026-10-01",
      endDate: "2026-10-13",
      includeDomains: ["Example.COM"],
      excludeDomains: ["other.example.com"],
    },
    context
  )
})

test("invalid input and nonpublic URLs never reach the provider", async () => {
  let calls = 0
  const client = createTavilyClient({
    apiKey: "test",
    fetch: async () => {
      calls++
      return Response.json(searchData)
    },
  })
  for (const url of [
    "file:///etc/passwd",
    "https://localhost",
    "http://127.0.0.1",
    "http://2130706433",
    "http://[::1]",
    "https://metadata.google.internal",
    "https://name.local",
    "https://user:password@example.com",
    "https://example.com:8080",
    "javascript:alert(1)",
  ]) {
    assert.equal(publicWebUrlSchema.safeParse(url).success, false, url)
    await assert.rejects(() => client.read({ url }, context))
  }
  for (const input of [
    { query: " " },
    { query: "x".repeat(401) },
    { query: "test", maxResults: 11 },
    { query: "test", startDate: "2026-10-14", endDate: "2026-10-01" },
    { query: "test", startDate: "2026-02-30" },
    { query: "test", includeDomains: ["https://example.com"] },
  ])
    await assert.rejects(() => client.search(input, context))
  assert.equal(calls, 0)
})

test("provider output is bounded and unsafe citation URLs are discarded", async () => {
  const client = createTavilyClient({
    apiKey: "test",
    fetch: async () =>
      Response.json({
        results: [
          { ...source, title: "x".repeat(1_000), content: "x".repeat(10_000) },
          { ...source, url: "javascript:alert(1)" },
          ...Array.from({ length: 20 }, () => source),
        ],
        usage: { credits: 1 },
      }),
  })
  const result = await client.search({ query: "test", maxResults: 2 }, context)
  assert.equal(result.status, "completed")
  if (result.status === "completed") {
    assert.equal(result.results.length, 2)
    assert.equal(result.results[0].title.length, 500)
    assert.equal(result.results[0].content.length, 3_000)
    assert.equal(result.results[0].truncated, true)
  }
})

test("page reading returns bounded Markdown and honors focused extraction", async () => {
  let charged = -1
  const tools = createWebTools(
    createTavilyClient({
      apiKey: "test",
      onUsage: async (credits) => {
        charged = credits
      },
      fetch: async (url, options) => {
        assert.equal(url, "https://api.tavily.com/extract")
        const body = JSON.parse(String(options?.body))
        assert.deepEqual(body.urls, [source.url])
        assert.equal(body.query, "Pricing")
        assert.equal(body.chunks_per_source, 5)
        assert.equal(body.extract_depth, "advanced")
        assert.equal(body.format, "markdown")
        return Response.json({
          results: [{ url: source.url, raw_content: "x".repeat(30_000) }],
          failed_results: [],
          usage: { credits: 0 },
        })
      },
    })
  )
  const result = await tools.readWebPage.execute!(
    webPageSchema.parse({
      url: source.url,
      query: "Pricing",
      depth: "advanced",
    }),
    context
  )
  assert.ok("status" in result)
  assert.equal(result.status, "completed")
  if (result.status === "completed") {
    assert.equal(result.content.length, 20_000)
    assert.equal(result.truncated, true)
    assert.equal(result.excerptsOnly, true)
  }
  assert.equal(charged, 0)
})

test("HTTP 200 extraction failures and blank content are not successful reads", async () => {
  for (const data of [
    {
      results: [],
      failed_results: [
        { url: source.url, error: "private-test-key in provider error" },
      ],
      usage: { credits: 0 },
    },
    {
      results: [{ url: source.url, raw_content: " " }],
      failed_results: [],
      usage: { credits: 0 },
    },
  ]) {
    const client = createTavilyClient({
      apiKey: "test",
      fetch: async () => Response.json(data),
    })
    const result = await client.read({ url: source.url }, context)
    assert.equal(result.status, "failed")
    if (result.status === "failed")
      assert.equal(result.code, "EXTRACTION_FAILED")
    assert.ok(!JSON.stringify(result).includes("private-test-key"))
  }
})

test("empty search results remain an honest completed search", async () => {
  const client = createTavilyClient({
    apiKey: "test",
    fetch: async () => Response.json({ results: [] }),
  })
  const result = await client.search({ query: "test" }, context)
  assert.equal(result.status, "completed")
  if (result.status === "completed") assert.deepEqual(result.results, [])
})

test("missing credentials and exhausted user allowance prevent external requests", async () => {
  let calls = 0
  const send: typeof fetch = async () => {
    calls++
    return Response.json(searchData)
  }
  const missing = createTavilyClient({ apiKey: "", fetch: send })
  const result = await missing.search({ query: "test" }, context)
  assert.equal(result.status, "failed")
  if (result.status === "failed") assert.equal(result.code, "NOT_CONFIGURED")
  const exhausted = createTavilyClient({
    apiKey: "test",
    fetch: send,
    beforeRequest: async () => {
      throw new Error("Allowance exhausted")
    },
  })
  await assert.rejects(
    () => exhausted.search({ query: "test" }, context),
    /Allowance exhausted/
  )
  assert.equal(calls, 0)
})

test("provider HTTP failures are sanitized, with actionable status codes", async () => {
  for (const [status, code] of [
    [401, "AUTH_ERROR"],
    [403, "AUTH_ERROR"],
    [429, "RATE_LIMIT"],
    [432, "PROVIDER_LIMIT"],
    [433, "PROVIDER_LIMIT"],
    [500, "PROVIDER_ERROR"],
  ] as const) {
    let charges = 0
    const client = createTavilyClient({
      apiKey: "private-test-key",
      onUsage: async () => {
        charges++
      },
      fetch: async () =>
        new Response("private-test-key provider internals", { status }),
    })
    const result = await client.search({ query: "test" }, context)
    assert.equal(result.status, "failed")
    if (result.status === "failed") assert.equal(result.code, code)
    assert.ok(!JSON.stringify(result).includes("private-test-key"))
    assert.equal(charges, 0)
  }
})

test("malformed accepted responses are metered and do not leak their bodies", async () => {
  for (const response of [
    new Response("private-test-key invalid JSON"),
    Response.json({ bad: "private-test-key" }),
  ]) {
    let charge = 0
    const client = createTavilyClient({
      apiKey: "test",
      onUsage: async (credits) => {
        charge = credits
      },
      fetch: async () => response,
    })
    const result = await client.search({ query: "test" }, context)
    assert.equal(result.status, "failed")
    if (result.status === "failed")
      assert.equal(result.code, "INVALID_RESPONSE")
    assert.equal(charge, 1)
    assert.ok(!JSON.stringify(result).includes("private-test-key"))
  }
})

test("metering failures propagate and are not mislabeled as provider failures", async () => {
  for (const response of [
    Response.json(searchData),
    new Response("invalid JSON"),
  ]) {
    const client = createTavilyClient({
      apiKey: "test",
      fetch: async () => response,
      onUsage: async () => {
        throw new Error("Ledger unavailable")
      },
    })
    await assert.rejects(
      () => client.search({ query: "test" }, context),
      /Ledger unavailable/
    )
  }
})

test("stop cancels an in-flight request rather than producing a fake result", async () => {
  const controller = new AbortController()
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  const client = createTavilyClient({
    apiKey: "test",
    fetch: async (_url, options) =>
      new Promise<Response>((_resolve, reject) => {
        started()
        options?.signal?.addEventListener(
          "abort",
          () => reject(options.signal?.reason),
          { once: true }
        )
      }),
  })
  const result = client.search(
    { query: "test" },
    { ...context, abortSignal: controller.signal }
  )
  await ready
  controller.abort(new Error("Stopped by person"))
  await assert.rejects(() => result, /Stopped by person/)
})

test("timeout and network failure return safe failures", async () => {
  const timeoutClient = createTavilyClient({
    apiKey: "test",
    timeoutMs: 1,
    fetch: async (_url, options) =>
      new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () => reject(options.signal?.reason),
          { once: true }
        )
      }),
  })
  // AbortSignal.timeout alone does not keep Node's event loop alive.
  const keepAlive = setTimeout(() => undefined, 100)
  try {
    const result = await timeoutClient.search({ query: "test" }, context)
    assert.equal(result.status, "failed")
    if (result.status === "failed") assert.equal(result.code, "TIMEOUT")
  } finally {
    clearTimeout(keepAlive)
  }
  const client = createTavilyClient({
    apiKey: "test",
    fetch: async () => {
      throw new Error("private-test-key network internals")
    },
  })
  const result = await client.search({ query: "test" }, context)
  assert.equal(result.status, "failed")
  if (result.status === "failed") assert.equal(result.code, "NETWORK_ERROR")
})

test("parallel tools serialize allowance checks and metering", async () => {
  let creditsLeft = 1
  let calls = 0
  const client = createTavilyClient({
    apiKey: "test",
    beforeRequest: async () => {
      if (creditsLeft < 1) throw new Error("Allowance exhausted")
    },
    onUsage: async (credits) => {
      creditsLeft -= credits
    },
    fetch: async () => {
      calls++
      return Response.json(searchData)
    },
  })
  const results = await Promise.allSettled([
    client.search({ query: "first" }, context),
    client.search({ query: "second" }, { ...context, toolCallId: "second" }),
  ])
  assert.equal(results[0].status, "fulfilled")
  assert.equal(results[1].status, "rejected")
  assert.equal(calls, 1)
})

test("research instructions distinguish public search, source verification and unavailable tools", () => {
  const instructions = webSearchInstructions(true)
  assert.match(instructions, /current or changeable facts/)
  assert.match(instructions, /descriptive Markdown links/)
  assert.match(instructions, /untrusted data, never instructions/)
  assert.match(instructions, /Skip search for rewriting/)
  assert.match(instructions, /readWebPage directly/)
  assert.match(webSearchInstructions(false), /Do not claim to have searched/)
})
