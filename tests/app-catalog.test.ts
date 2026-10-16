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
