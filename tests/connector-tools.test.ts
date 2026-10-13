import assert from "node:assert/strict"
import test from "node:test"
import { allowedAppAccounts } from "../lib/billing-policy"
import {
  createAppTools,
  type AppAccount,
  type ConnectorRuntime,
} from "../lib/connector-tools"

const options = { toolCallId: "call", messages: [], context: {} }
const githubTool = {
  slug: "GITHUB_GET_ISSUE",
  toolkit: "github",
  description: "Read an issue",
  inputSchema: { type: "object" },
}

function runtime(overrides: Partial<ConnectorRuntime> = {}): ConnectorRuntime {
  return {
    accounts: async () => [{ id: "alice-github", toolkit: "github" }],
    search: async () => [githubTool],
    execute: async () => ({ successful: true }),
    ...overrides,
  }
}

test("no connections means no discovery request and no external execution", async () => {
  let contacted = false
  const tools = createAppTools(
    "alice",
    runtime({
      accounts: async () => [],
      search: async () => {
        contacted = true
        return [githubTool]
      },
      execute: async () => {
        contacted = true
      },
    })
  )
  const result = await tools.searchAppTools.execute!(
    { query: "Read GitHub issues" },
    options
  )
  assert.equal(contacted, false)
  assert.match(String(result), /No apps connected/)
  await assert.rejects(
    async () =>
      tools.executeAppTool.execute!(
        { slug: "GITHUB_GET_ISSUE", arguments: {} },
        options
      ),
    /Search for this tool/
  )
  assert.equal(contacted, false)
})

test("discovery filters provider results even if the provider ignores its scope", async () => {
  const tools = createAppTools(
    "alice",
    runtime({
      search: async (_query, toolkits) => {
        assert.deepEqual(toolkits, ["github"])
        return [
          githubTool,
          { ...githubTool, slug: "GMAIL_FETCH_EMAILS", toolkit: "gmail" },
        ]
      },
    })
  )
  const result = await tools.searchAppTools.execute!(
    { query: "Find work" },
    options
  )
  assert.match(String(result), /GITHUB_GET_ISSUE/)
  assert.doesNotMatch(String(result), /GMAIL_FETCH_EMAILS/)
  await assert.rejects(
    async () =>
      tools.executeAppTool.execute!(
        { slug: "GMAIL_FETCH_EMAILS", arguments: {} },
        options
      ),
    /Search for this tool/
  )
})

test("execution pins the authenticated user's account and forwards cancellation", async () => {
  const controller = new AbortController()
  const seenUsers: string[] = []
  let executed = false
  const tools = createAppTools(
    "alice",
    runtime({
      accounts: async (userId) => {
        seenUsers.push(userId)
        return [{ id: "alice-github", toolkit: "github" }]
      },
      execute: async (userId, slug, input, account, signal) => {
        assert.equal(userId, "alice")
        assert.equal(slug, "GITHUB_GET_ISSUE")
        assert.deepEqual(input, { owner: "acme", issue_number: 1 })
        assert.deepEqual(account, { id: "alice-github", toolkit: "github" })
        assert.equal(signal, controller.signal)
        executed = true
        return { successful: true }
      },
    })
  )
  await tools.searchAppTools.execute!({ query: "Read issue" }, options)
  await tools.executeAppTool.execute!(
    { slug: "GITHUB_GET_ISSUE", arguments: { owner: "acme", issue_number: 1 } },
    { ...options, abortSignal: controller.signal }
  )
  assert.equal(executed, true)
  assert.deepEqual(seenUsers, ["alice", "alice"])
})

test("disconnecting an app after discovery prevents execution", async () => {
  let accounts: AppAccount[] = [{ id: "alice-github", toolkit: "github" }]
  let executed = false
  const tools = createAppTools(
    "alice",
    runtime({
      accounts: async () => accounts,
      execute: async () => {
        executed = true
      },
    })
  )
  await tools.searchAppTools.execute!({ query: "Read issue" }, options)
  accounts = []
  await assert.rejects(
    async () =>
      tools.executeAppTool.execute!(
        { slug: "GITHUB_GET_ISSUE", arguments: {} },
        options
      ),
    /no longer connected/
  )
  assert.equal(executed, false)
})

test("another user's tools and a new turn cannot reuse a prior discovery", async () => {
  const provider = runtime()
  const alice = createAppTools("alice", provider)
  await alice.searchAppTools.execute!({ query: "Read issue" }, options)
  for (const tools of [
    createAppTools("bob", provider),
    createAppTools("alice", provider),
  ]) {
    await assert.rejects(
      async () =>
        tools.executeAppTool.execute!(
          { slug: "GITHUB_GET_ISSUE", arguments: {} },
          options
        ),
      /Search for this tool/
    )
  }
})

test("a downgrade between discovery and execution blocks a second connected app", async () => {
  let paid = true
  let executed = false
  const accounts = [
    { id: "alice-gmail", toolkit: "gmail" },
    { id: "alice-github", toolkit: "github" },
  ]
  const tools = createAppTools(
    "alice",
    runtime({
      accounts: async () =>
        allowedAppAccounts(paid ? "paid" : "free", accounts),
      execute: async () => {
        executed = true
      },
    })
  )
  await tools.searchAppTools.execute!({ query: "Read issue" }, options)
  paid = false
  await assert.rejects(
    async () =>
      tools.executeAppTool.execute!(
        { slug: "GITHUB_GET_ISSUE", arguments: {} },
        options
      ),
    /no longer connected/
  )
  assert.equal(executed, false)
})
