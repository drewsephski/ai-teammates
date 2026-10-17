import assert from "node:assert/strict"
import { beforeEach, test } from "node:test"

import {
  findApps,
  prepareAppConnection,
  resetAppCatalogCache,
  type AppCatalogDeps,
} from "../lib/app-catalog"
import { APP_AUTH_CACHE_MS, MAX_CATALOG_PAGE } from "../lib/app-catalog-policy"
import type { PlanTier } from "../lib/billing-policy"

beforeEach(() => resetAppCatalogCache())

function deps(
  overrides: Partial<AppCatalogDeps> & {
    plan?: PlanTier
    connected?: { id: string; toolkit: string }[]
  } = {}
) {
  const { plan, connected, ...rest } = overrides
  const calls = { search: [] as number[], auth: [] as string[][], project: 0 }
  const value: AppCatalogDeps = {
    configured: () => true,
    searchToolkits: async (_user, _query, limit) => {
      calls.search.push(limit)
      return [
        {
          slug: "googlesheets",
          name: "Google Sheets",
          logo: "https://l/s.png",
        },
        { slug: "canvas", name: "Canvas", logo: "http://l/c.png" },
      ]
    },
    getToolkitAuth: async (slugs) => {
      calls.auth.push(slugs)
      return new Map(
        slugs.map((slug) => [
          slug,
          slug === "googlesheets"
            ? {
                managedSchemes: ["OAUTH2"],
                name: "Google Sheets",
                logo: "https://l/s.png",
              }
            : { managedSchemes: [], name: "Canvas LMS", logo: null },
        ])
      )
    },
    projectToolkits: async () => {
      calls.project++
      return new Set<string>()
    },
    accounts: async () => connected ?? [],
    tier: async () => plan ?? "paid",
    ...rest,
  }
  return { value, calls }
}

test("findApps marks connectable apps and drops insecure logos", async () => {
  const { value } = deps()
  const result = await findApps("u", { query: "grades", limit: 5 }, value)
  assert.equal(result.configured, true)
  assert.deepEqual(
    result.apps.map((app) => [app.toolkit, app.connectable, app.logo]),
    [
      ["googlesheets", true, "https://l/s.png"],
      ["canvas", false, null],
    ]
  )
})

test("toolkit auth is cached per slug, and only uncached slugs are fetched", async () => {
  const { value, calls } = deps()
  await findApps("u", { query: "a", limit: 5 }, value)
  await findApps("u", { query: "b", limit: 5 }, value)
  assert.equal(calls.auth.length, 1)
  // The project's auth configs are listed once, too
  assert.equal(calls.project, 1)
  const more = deps({
    searchToolkits: async () => [
      { slug: "googlesheets", name: "Google Sheets" },
      { slug: "gmail", name: "Gmail" },
    ],
  })
  await findApps("u", { query: "c", limit: 5 }, more.value)
  assert.deepEqual(more.calls.auth, [["gmail"]])
})

test("the cache expires", async (t) => {
  const { value, calls } = deps()
  t.mock.timers.enable({ apis: ["Date"], now: 1_000 })
  await findApps("u", { query: "a", limit: 5 }, value)
  t.mock.timers.setTime(1_000 + APP_AUTH_CACHE_MS + 1)
  await findApps("u", { query: "a", limit: 5 }, value)
  assert.equal(calls.auth.length, 2)
})

test("the search limit never exceeds the catalog page size", async () => {
  const { value, calls } = deps()
  await findApps("u", { query: "a", limit: 500 }, value)
  assert.deepEqual(calls.search, [MAX_CATALOG_PAGE])
})

test("the free plan blocks other apps once one is connected", async () => {
  const { value } = deps({
    plan: "free",
    connected: [{ id: "1", toolkit: "gmail" }],
  })
  const result = await findApps("u", { query: "a", limit: 5 }, value)
  assert.equal(result.apps[0].blockedByPlan, true)
})

test("an unconfigured server reports it without calling Composio", async () => {
  const { value, calls } = deps({ configured: () => false })
  assert.deepEqual(await findApps("u", { query: "a", limit: 5 }, value), {
    configured: false,
    apps: [],
  })
  assert.equal(calls.auth.length, 0)
})

test("prepareAppConnection uses the catalog's name and logo, not the model's", async () => {
  const { value } = deps()
  assert.deepEqual(
    await prepareAppConnection(
      "u",
      { toolkit: "googlesheets", name: "Sheets pls" },
      value
    ),
    { name: "Google Sheets", logo: "https://l/s.png", state: "connect" }
  )
})

test("prepareAppConnection reports the plan-limit state", async () => {
  const { value } = deps({
    plan: "free",
    connected: [{ id: "1", toolkit: "gmail" }],
  })
  const card = await prepareAppConnection(
    "u",
    { toolkit: "googlesheets", name: "Google Sheets" },
    value
  )
  assert.equal(card.state, "planLimit")
})

test("prepareAppConnection refuses unknown, custom-auth and connected apps", async () => {
  const unknown = deps({ getToolkitAuth: async () => new Map() })
  await assert.rejects(
    prepareAppConnection(
      "u",
      { toolkit: "zillow", name: "Zillow" },
      unknown.value
    ),
    /Zillow isn't in Krafty's app catalog\. Use the computer instead\./
  )
  const { value } = deps()
  await assert.rejects(
    prepareAppConnection("u", { toolkit: "canvas", name: "Canvas" }, value),
    /custom authentication/
  )
  const connected = deps({ connected: [{ id: "1", toolkit: "googlesheets" }] })
  await assert.rejects(
    prepareAppConnection(
      "u",
      { toolkit: "googlesheets", name: "Google Sheets" },
      connected.value
    ),
    /already connected/
  )
})

test("a thin first search is retried with refined queries, capped at three calls", async () => {
  const seen: string[] = []
  const { value } = deps({
    searchToolkits: async (_user, query) => {
      seen.push(query)
      return query === "canvas"
        ? [{ slug: "canvas", name: "Canvas", logo: null }]
        : []
    },
  })
  const result = await findApps(
    "u",
    { query: "school grades", limit: 5 },
    value
  )
  assert.deepEqual(seen, ["school grades", "canvas", "google classroom"])
  assert.deepEqual(
    result.apps.map((app) => app.toolkit),
    ["canvas"]
  )
  assert.deepEqual(result.searched, seen)
})

test("a full first search is not retried, and an unrefinable query makes one call", async () => {
  const seen: string[] = []
  const many = deps({
    searchToolkits: async (_user, query) => {
      seen.push(query)
      return [
        { slug: "googlesheets", name: "Google Sheets" },
        { slug: "gmail", name: "Gmail" },
      ]
    },
  })
  const full = await findApps(
    "u",
    { query: "school grades", limit: 5 },
    many.value
  )
  assert.deepEqual(seen, ["school grades"])
  assert.equal(full.searched, undefined)
  seen.length = 0
  const none = deps({
    searchToolkits: async (_user, query) => {
      seen.push(query)
      return []
    },
  })
  const empty = await findApps("u", { query: "zillow", limit: 5 }, none.value)
  assert.deepEqual(seen, ["zillow"])
  assert.deepEqual(empty.apps, [])
  assert.match(empty.message ?? "", /doesn't prove/)
})

test("a failing refinement keeps the first search's answer", async () => {
  let calls = 0
  const { value } = deps({
    searchToolkits: async () => {
      if (calls++) throw new Error("rate limited")
      return [{ slug: "googlesheets", name: "Google Sheets" }]
    },
  })
  const result = await findApps(
    "u",
    { query: "fantasy football league", limit: 5 },
    value
  )
  assert.equal(result.apps.length, 1)
})

test("refined results never exceed the limit", async () => {
  const { value } = deps({
    searchToolkits: async (_user, query) =>
      [1, 2, 3].map((i) => ({ slug: `${query}${i}`, name: `${query} ${i}` })),
  })
  const result = await findApps("u", { query: "tiny", limit: 2 }, value)
  assert.ok(result.apps.length <= 2)
})

test("an expired connection is offered as a reconnect, not as connected", async () => {
  const { value } = deps({
    reconnectToolkits: async () => new Set(["googlesheets"]),
  })
  const result = await findApps("u", { query: "sheets", limit: 5 }, value)
  const sheets = result.apps.find((app) => app.toolkit === "googlesheets")
  assert.equal(sheets?.connected, false)
  assert.equal(sheets?.needsReconnect, true)
  // Other apps carry no flag at all
  assert.equal("needsReconnect" in result.apps[1], false)
  assert.deepEqual(
    await prepareAppConnection(
      "u",
      { toolkit: "googlesheets", name: "Google Sheets" },
      value
    ),
    {
      name: "Google Sheets",
      logo: "https://l/s.png",
      state: "connect",
      reconnect: true,
    }
  )
})

test("a working account wins over a stale one: connected, no reconnect flag", async () => {
  const { value } = deps({
    connected: [{ id: "1", toolkit: "googlesheets" }],
    reconnectToolkits: async () => new Set(["googlesheets"]),
  })
  const result = await findApps("u", { query: "sheets", limit: 5 }, value)
  const sheets = result.apps.find((app) => app.toolkit === "googlesheets")
  assert.equal(sheets?.connected, true)
  assert.equal("needsReconnect" in (sheets ?? {}), false)
})

test("a failing status lookup never breaks findApps or the card", async () => {
  const { value } = deps({
    reconnectToolkits: async () => {
      throw new Error("down")
    },
  })
  const result = await findApps("u", { query: "sheets", limit: 5 }, value)
  assert.equal(result.apps.length, 2)
  const card = await prepareAppConnection(
    "u",
    { toolkit: "googlesheets", name: "Google Sheets" },
    value
  )
  assert.equal(card.reconnect, undefined)
})

test("refusing a connected app steers the model to searchAppTools", async () => {
  const connected = deps({ connected: [{ id: "1", toolkit: "googlesheets" }] })
  await assert.rejects(
    prepareAppConnection(
      "u",
      { toolkit: "googlesheets", name: "Google Sheets" },
      connected.value
    ),
    /searchAppTools.*different words/
  )
})

test("a working app refused for a missing permission offers a reconnect card", async () => {
  const { value } = deps({
    connected: [{ id: "1", toolkit: "googlesheets" }],
    limitedToolkits: async () => new Set(["googlesheets"]),
  })
  const result = await findApps("u", { query: "sheets", limit: 5 }, value)
  const sheets = result.apps.find((app) => app.toolkit === "googlesheets")
  // Still connected: read access isn't hidden
  assert.equal(sheets?.connected, true)
  assert.equal(sheets?.needsReconnect, true)
  assert.deepEqual(
    await prepareAppConnection(
      "u",
      { toolkit: "googlesheets", name: "Google Sheets" },
      value
    ),
    {
      name: "Google Sheets",
      logo: "https://l/s.png",
      state: "connect",
      reconnect: true,
    }
  )
})

test("a limited app on the free plan reconnects without hitting the plan limit", async () => {
  const { value } = deps({
    plan: "free",
    connected: [{ id: "1", toolkit: "googlesheets" }],
    limitedToolkits: async () => new Set(["googlesheets"]),
  })
  const card = await prepareAppConnection(
    "u",
    { toolkit: "googlesheets", name: "Google Sheets" },
    value
  )
  assert.equal(card.state, "connect")
  assert.equal(card.reconnect, true)
})

test("an app that is connected and not limited is still refused", async () => {
  const { value } = deps({
    connected: [{ id: "1", toolkit: "googlesheets" }],
    limitedToolkits: async () => new Set(["other"]),
  })
  await assert.rejects(
    prepareAppConnection(
      "u",
      { toolkit: "googlesheets", name: "Google Sheets" },
      value
    ),
    /already connected/
  )
})
