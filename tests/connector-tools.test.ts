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
    search: async () => ({ tools: [githubTool], guidance: {} }),
    schema: async (slug) => (slug === githubTool.slug ? githubTool : undefined),
    execute: async () => ({ resultType: "completed", error: null, data: {} }),
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
        return { tools: [githubTool], guidance: {} }
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
  assert.deepEqual(JSON.parse(String(result)).connectedApps, [])
  assert.match(String(result), /official website/)
  assert.match(
    String(
      await tools.executeAppTool.execute!(
        { slug: "GITHUB_GET_ISSUE", arguments: {} },
        options
      )
    ),
    /SCHEMA_REQUIRED/
  )
  assert.equal(contacted, false)
})

test("discovery filters provider results even if the provider ignores its scope", async () => {
  const tools = createAppTools(
    "alice",
    runtime({
      search: async (_query, accounts) => {
        assert.deepEqual(accounts, [{ id: "alice-github", toolkit: "github" }])
        return {
          tools: [
            githubTool,
            { ...githubTool, slug: "GMAIL_FETCH_EMAILS", toolkit: "gmail" },
          ],
          guidance: {},
        }
      },
    })
  )
  const result = await tools.searchAppTools.execute!(
    { query: "Find work" },
    options
  )
  assert.match(String(result), /GITHUB_GET_ISSUE/)
  assert.doesNotMatch(String(result), /GMAIL_FETCH_EMAILS/)
  assert.deepEqual(JSON.parse(String(result)).connectedApps, ["github"])
  assert.doesNotMatch(String(result), /alice-github/)
  assert.match(
    String(
      await tools.executeAppTool.execute!(
        { slug: "GMAIL_FETCH_EMAILS", arguments: {} },
        options
      )
    ),
    /SCHEMA_REQUIRED/
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
  assert.match(
    String(
      await tools.executeAppTool.execute!(
        { slug: "GITHUB_GET_ISSUE", arguments: {} },
        options
      )
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
    assert.match(
      String(
        await tools.executeAppTool.execute!(
          { slug: "GITHUB_GET_ISSUE", arguments: {} },
          options
        )
      ),
      /SCHEMA_REQUIRED/
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
  assert.match(
    String(
      await tools.executeAppTool.execute!(
        { slug: "GITHUB_GET_ISSUE", arguments: {} },
        options
      )
    ),
    /no longer connected/
  )
  assert.equal(executed, false)
})

const sendDraft = {
  slug: "GMAIL_SEND_DRAFT",
  toolkit: "gmail",
  description: "Send an existing draft as-is; draft_id is not a message ID.",
  inputSchema: {
    type: "object",
    required: ["draft_id"],
    properties: {
      draft_id: { type: "string" },
      user_id: { type: "string", default: "me" },
    },
    additionalProperties: false,
  },
}
const gmailAccount = { id: "alice-gmail", toolkit: "gmail" }

function gmailRuntime(overrides: Partial<ConnectorRuntime> = {}) {
  return runtime({
    accounts: async () => [gmailAccount],
    search: async () => ({
      tools: [sendDraft],
      guidance: { knownPitfalls: ["Use a draft ID, not a message ID"] },
    }),
    schema: async (slug) => (slug === sendDraft.slug ? sendDraft : undefined),
    ...overrides,
  })
}

async function loadDraftTool(provider: ConnectorRuntime) {
  const tools = createAppTools("alice", provider)
  await tools.getAppToolSchema.execute!({ slug: sendDraft.slug }, options)
  return tools
}

test("a fresh approval turn can load an exact schema without repeating fuzzy search", async () => {
  let calls = 0
  const tools = await loadDraftTool(
    gmailRuntime({
      search: async () => {
        throw new Error("No fuzzy search needed")
      },
      execute: async (_user, slug, input) => {
        calls++
        assert.equal(slug, sendDraft.slug)
        assert.deepEqual(input, { draft_id: "r-existing-approved-draft" })
        return {
          resultType: "completed",
          error: null,
          logId: "log-send",
          data: { id: "sent-message" },
        }
      },
    })
  )
  const result = JSON.parse(
    String(
      await tools.executeAppTool.execute!(
        {
          slug: sendDraft.slug,
          arguments: { draft_id: "r-existing-approved-draft" },
        },
        options
      )
    )
  )
  assert.equal(result.status, "succeeded")
  assert.equal(result.logId, "log-send")
  assert.equal(calls, 1)
})

test("missing fields, wrong types and unsupported fields never reach the provider", async () => {
  let calls = 0
  const tools = await loadDraftTool(
    gmailRuntime({
      execute: async () => {
        calls++
      },
    })
  )
  for (const input of [
    {},
    { draft_id: 42 },
    { draft_id: "r1", recipient_email: "new@example.com" },
  ]) {
    const result = JSON.parse(
      String(
        await tools.executeAppTool.execute!(
          { slug: sendDraft.slug, arguments: input },
          options
        )
      )
    )
    assert.equal(result.code, "INVALID_ARGUMENTS")
    assert.ok(result.issues.length)
  }
  assert.equal(calls, 0)
})

test("exact schema lookup cannot expose or authorize another toolkit", async () => {
  const tools = createAppTools(
    "alice",
    runtime({ schema: async () => sendDraft })
  )
  assert.match(
    String(
      await tools.getAppToolSchema.execute!({ slug: sendDraft.slug }, options)
    ),
    /TOOL_NOT_AVAILABLE/
  )
  assert.match(
    String(
      await tools.executeAppTool.execute!(
        { slug: sendDraft.slug, arguments: { draft_id: "r1" } },
        options
      )
    ),
    /SCHEMA_REQUIRED/
  )
})

test("replacement accounts require a fresh schema instead of silently switching sender", async () => {
  let current = gmailAccount
  let calls = 0
  const tools = await loadDraftTool(
    gmailRuntime({
      accounts: async () => [current],
      execute: async () => {
        calls++
      },
    })
  )
  current = { ...gmailAccount, id: "replacement" }
  assert.match(
    String(
      await tools.executeAppTool.execute!(
        { slug: sendDraft.slug, arguments: { draft_id: "r1" } },
        options
      )
    ),
    /ACCOUNT_CHANGED/
  )
  assert.equal(calls, 0)
})

test("failed executions with null error are not reported as successful", async () => {
  const tools = await loadDraftTool(
    gmailRuntime({
      execute: async () => ({
        resultType: "failed",
        error: null,
        logId: "log-failed",
        data: { detail: "Draft not found" },
      }),
    })
  )
  const result = JSON.parse(
    String(
      await tools.executeAppTool.execute!(
        { slug: sendDraft.slug, arguments: { draft_id: "r1" } },
        options
      )
    )
  )
  assert.equal(result.status, "failed")
  assert.equal(result.logId, "log-failed")
  assert.equal(result.data.detail, "Draft not found")
})

test("transport exceptions produce an unconfirmed outcome without leaking SDK internals", async () => {
  let calls = 0
  const tools = await loadDraftTool(
    gmailRuntime({
      execute: async () => {
        calls++
        throw new Error("secret-request-header")
      },
    })
  )
  const result = String(
    await tools.executeAppTool.execute!(
      { slug: sendDraft.slug, arguments: { draft_id: "r1" } },
      options
    )
  )
  assert.equal(JSON.parse(result).status, "unknown")
  assert.match(result, /Verify external state/)
  assert.doesNotMatch(result, /secret-request-header/)
  assert.equal(calls, 1)
})

test("large execution results retain outcome and diagnostic IDs as valid JSON", async () => {
  const tools = await loadDraftTool(
    gmailRuntime({
      execute: async () => ({
        resultType: "failed",
        error: null,
        logId: "log-large",
        data: { text: "x".repeat(110_000) },
      }),
    })
  )
  const result = JSON.parse(
    String(
      await tools.executeAppTool.execute!(
        { slug: sendDraft.slug, arguments: { draft_id: "r1" } },
        options
      )
    )
  )
  assert.equal(result.status, "failed")
  assert.equal(result.logId, "log-large")
  assert.equal(result.truncated, true)
})

test("oversized discovery never authorizes a schema omitted from the model output", async () => {
  let calls = 0
  const large = {
    ...sendDraft,
    inputSchema: { ...sendDraft.inputSchema, description: "x".repeat(80_000) },
  }
  const tools = createAppTools(
    "alice",
    gmailRuntime({
      search: async () => ({ tools: [large], guidance: {} }),
      execute: async () => {
        calls++
      },
    })
  )
  const search = JSON.parse(
    String(
      await tools.searchAppTools.execute!(
        { query: "Send an existing Gmail draft" },
        options
      )
    )
  )
  assert.equal(search.tools[0].inputSchema, undefined)
  assert.match(
    String(
      await tools.executeAppTool.execute!(
        { slug: sendDraft.slug, arguments: { draft_id: "r1" } },
        options
      )
    ),
    /SCHEMA_REQUIRED/
  )
  assert.equal(calls, 0)
})

test("a failed schema refresh invalidates the previous schema and preserves safe request IDs", async () => {
  let lookups = 0
  const tools = await loadDraftTool(
    gmailRuntime({
      schema: async () => {
        if (lookups++ === 0) return sendDraft
        throw Object.assign(new Error("private SDK details"), {
          requestId: "request-123",
        })
      },
    })
  )
  const result = String(
    await tools.getAppToolSchema.execute!({ slug: sendDraft.slug }, options)
  )
  assert.match(result, /SCHEMA_LOOKUP_FAILED/)
  assert.match(result, /request-123/)
  assert.doesNotMatch(result, /private SDK details/)
  assert.match(
    String(
      await tools.executeAppTool.execute!(
        { slug: sendDraft.slug, arguments: { draft_id: "r1" } },
        options
      )
    ),
    /SCHEMA_REQUIRED/
  )
})

const sendTool = {
  slug: "GITHUB_CREATE_AN_ISSUE",
  toolkit: "github",
  description: "Create an issue",
  inputSchema: { type: "object" },
}

function gate(
  overrides: Partial<import("../lib/connector-tools").ApprovalGate> = {}
) {
  const requests: unknown[] = []
  const completed: unknown[] = []
  return {
    requests,
    completed,
    gate: {
      required: async (tool: { slug: string }) => tool.slug === sendTool.slug,
      request: async (call: { summary?: string }) => {
        requests.push(call)
        return { approvalId: "apr_1", summary: call.summary ?? "Create issue" }
      },
      claim: async (id: string) =>
        id === "apr_1"
          ? {
              slug: sendTool.slug,
              toolkit: "github",
              accountId: "alice-github",
              input: { title: "Approved title" },
            }
          : undefined,
      complete: async (id: string, outcome: unknown) => {
        completed.push([id, outcome])
      },
      ...overrides,
    },
  }
}

test("a write is held for approval and never executed by executeAppTool", async () => {
  let executed = false
  const { gate: approvals, requests } = gate()
  const tools = createAppTools(
    "alice",
    runtime({
      search: async () => ({ tools: [sendTool], guidance: {} }),
      execute: async () => {
        executed = true
        return { resultType: "completed", error: null }
      },
    }),
    approvals
  )
  await tools.searchAppTools.execute!({ query: "Create an issue" }, options)
  const result = JSON.parse(
    String(
      await tools.executeAppTool.execute!(
        {
          slug: sendTool.slug,
          arguments: { title: "Bug" },
          summary: "Open a GitHub issue titled Bug",
        },
        options
      )
    )
  )
  assert.equal(result.status, "approval_required")
  assert.equal(result.approvalId, "apr_1")
  assert.equal(executed, false)
  assert.deepEqual(requests, [
    {
      slug: sendTool.slug,
      toolkit: "github",
      accountId: "alice-github",
      input: { title: "Bug" },
      summary: "Open a GitHub issue titled Bug",
    },
  ])
})

test("reads run without approval", async () => {
  const { gate: approvals, requests } = gate()
  const tools = createAppTools("alice", runtime(), approvals)
  await tools.searchAppTools.execute!({ query: "Read issues" }, options)
  const result = JSON.parse(
    String(
      await tools.executeAppTool.execute!(
        { slug: githubTool.slug, arguments: {} },
        options
      )
    )
  )
  assert.equal(result.status, "succeeded")
  assert.equal(requests.length, 0)
})

test("an approved action runs the stored call once, not the model's arguments", async () => {
  const calls: unknown[] = []
  const { gate: approvals, completed } = gate()
  const tools = createAppTools(
    "alice",
    runtime({
      execute: async (_user, slug, input) => {
        calls.push([slug, input])
        return { resultType: "completed", error: null }
      },
    }),
    approvals
  )
  const result = JSON.parse(
    String(
      await tools.runApprovedAction.execute!({ approvalId: "apr_1" }, options)
    )
  )
  assert.equal(result.status, "succeeded")
  assert.deepEqual(calls, [[sendTool.slug, { title: "Approved title" }]])
  assert.deepEqual(completed, [
    ["apr_1", { ok: true, result: { status: "succeeded" } }],
  ])
  const unknown = JSON.parse(
    String(
      await tools.runApprovedAction.execute!(
        { approvalId: "apr_other" },
        options
      )
    )
  )
  assert.equal(unknown.code, "NOT_APPROVED")
  assert.equal(calls.length, 1)
})

test("an approved action refuses to run on a different connected account", async () => {
  let executed = false
  const { gate: approvals, completed } = gate()
  const tools = createAppTools(
    "alice",
    runtime({
      accounts: async () => [{ id: "alice-github-2", toolkit: "github" }],
      execute: async () => {
        executed = true
      },
    }),
    approvals
  )
  const result = JSON.parse(
    String(
      await tools.runApprovedAction.execute!({ approvalId: "apr_1" }, options)
    )
  )
  assert.equal(result.code, "ACCOUNT_CHANGED")
  assert.equal(executed, false)
  assert.equal((completed[0] as [string, { ok: boolean }])[1].ok, false)
})

test("a claimed approval records a failure when the provider throws before running", async () => {
  const { gate: approvals, completed } = gate()
  const tools = createAppTools(
    "alice",
    runtime({
      accounts: async () => {
        throw new Error("Composio unavailable")
      },
    }),
    approvals
  )
  const result = JSON.parse(
    String(
      await tools.runApprovedAction.execute!({ approvalId: "apr_1" }, options)
    )
  )
  assert.equal(result.status, "unknown")
  assert.equal((completed[0] as [string, { ok: boolean }])[1].ok, false)
})
