import assert from "node:assert/strict"
import { beforeEach, test } from "node:test"

import { resetConnectionHealth } from "../lib/connection-health"
import {
  ambiguousToolkits,
  holdsAppSlot,
  selectAccount,
} from "../lib/connector-account-policy"
import {
  classifyEnvelope,
  classifyThrown,
} from "../lib/connector-failure-policy"
import {
  createAppTools,
  type AppAccount,
  type ConnectorRuntime,
} from "../lib/connector-tools"

beforeEach(() => resetConnectionHealth())

const options = { toolCallId: "call", messages: [], context: {} }
const readTool = {
  slug: "GMAIL_FETCH_EMAILS",
  toolkit: "gmail",
  description: "Read mail",
  inputSchema: { type: "object" },
}
const work: AppAccount = { id: "ca_work", toolkit: "gmail", label: "work" }
const home: AppAccount = { id: "ca_home", toolkit: "gmail", label: "home" }

function runtime(
  accounts: AppAccount[],
  overrides: Partial<ConnectorRuntime> = {}
): ConnectorRuntime {
  return {
    accounts: async () => accounts,
    search: async () => ({ tools: [readTool], guidance: {} }),
    schema: async () => readTool,
    execute: async () => ({ resultType: "completed", error: null, data: {} }),
    ...overrides,
  }
}

async function loaded(rt: ConnectorRuntime) {
  const tools = createAppTools("alice", rt)
  await tools.searchAppTools.execute!({ query: "read mail" }, options)
  return tools
}

const run = async (
  tools: Awaited<ReturnType<typeof loaded>>,
  extra: { accountId?: string } = {}
) =>
  JSON.parse(
    String(
      await tools.executeAppTool.execute!(
        { slug: readTool.slug, arguments: {}, ...extra },
        options
      )
    )
  )

test("selectAccount: one account runs, two need a choice, a stranger's ID is refused", () => {
  assert.deepEqual(selectAccount([work], "gmail"), { ok: true, account: work })
  assert.deepEqual(selectAccount([work], "github"), {
    ok: false,
    reason: "none",
  })
  const ambiguous = selectAccount([work, home], "gmail")
  assert.equal(ambiguous.ok, false)
  assert.equal(!ambiguous.ok && ambiguous.reason, "ambiguous")
  assert.deepEqual(selectAccount([work, home], "gmail", "ca_home"), {
    ok: true,
    account: home,
  })
  const unknown = selectAccount([work, home], "gmail", "ca_other_user")
  assert.equal(!unknown.ok && unknown.reason, "unknown")
  // An account of another toolkit is not a match either
  assert.equal(
    selectAccount([work, { id: "ca_gh", toolkit: "github" }], "gmail", "ca_gh")
      .ok,
    false
  )
  assert.deepEqual(
    ambiguousToolkits([work, home, { id: "g", toolkit: "github" }]).map(
      (entry) => entry.toolkit
    ),
    ["gmail"]
  )
})

test("two accounts for one app: execution asks which instead of picking the first", async () => {
  let executed = false
  const tools = await loaded(
    runtime([work, home], {
      execute: async () => {
        executed = true
      },
    })
  )
  const result = await run(tools)
  assert.equal(result.status, "requires_input")
  assert.equal(result.code, "ACCOUNT_CHOICE_REQUIRED")
  assert.deepEqual(result.accounts, [
    { accountId: "ca_work", label: "work" },
    { accountId: "ca_home", label: "home" },
  ])
  assert.equal(executed, false)
})

test("discovery tells the model which apps have several accounts", async () => {
  const tools = createAppTools("alice", runtime([work, home]))
  const search = JSON.parse(
    String(await tools.searchAppTools.execute!({ query: "mail" }, options))
  )
  assert.equal(search.accountsToChoose[0].toolkit, "gmail")
  assert.equal(search.accountsToChoose[0].accounts.length, 2)
  const single = createAppTools("alice", runtime([work]))
  assert.equal(
    JSON.parse(
      String(await single.searchAppTools.execute!({ query: "mail" }, options))
    ).accountsToChoose,
    undefined
  )
})

test("a chosen accountId runs on exactly that account", async () => {
  const used: string[] = []
  const tools = await loaded(
    runtime([work, home], {
      execute: async (_user, _slug, _input, account) => {
        used.push(account.id)
        return { resultType: "completed" }
      },
    })
  )
  const result = await run(tools, { accountId: "ca_home" })
  assert.equal(result.status, "succeeded")
  assert.equal(result.accountId, "ca_home")
  assert.deepEqual(used, ["ca_home"])
})

test("an accountId that isn't this person's account for the app never executes", async () => {
  let executed = false
  const tools = await loaded(
    runtime([work, home], {
      execute: async () => {
        executed = true
      },
    })
  )
  const result = await run(tools, { accountId: "ca_someone_elses" })
  assert.equal(result.status, "requires_input")
  assert.equal(result.code, "ACCOUNT_NOT_FOUND")
  // The refusal lists only this person's own accounts
  assert.deepEqual(
    result.accounts.map((a: { accountId: string }) => a.accountId),
    ["ca_work", "ca_home"]
  )
  // Even with a single account the ID must match it
  const single = await loaded(runtime([work]))
  assert.equal(
    (await run(single, { accountId: "ca_home" })).code,
    "ACCOUNT_NOT_FOUND"
  )
  assert.equal(executed, false)
})

test("a bound account leaves nothing to choose", async () => {
  // createConnectorTools drops a toolkit's other accounts for a For you source
  const tools = await loaded(runtime([work]))
  assert.equal((await run(tools)).status, "succeeded")
})

test("an approval records the account that was chosen", async () => {
  const requests: { accountId: string }[] = []
  const tools = createAppTools("alice", runtime([work, home]), {
    required: async () => true,
    request: async (call) => {
      requests.push(call)
      return { approvalId: "apr", summary: "x" }
    },
    claim: async () => undefined,
    complete: async () => {},
  })
  await tools.searchAppTools.execute!({ query: "mail" }, options)
  const result = JSON.parse(
    String(
      await tools.executeAppTool.execute!(
        { slug: readTool.slug, arguments: {}, accountId: "ca_home" },
        options
      )
    )
  )
  assert.equal(result.status, "approval_required")
  assert.equal(requests[0].accountId, "ca_home")
})

test("a rule is checked against the chosen account", async () => {
  const seen: string[] = []
  const tools = createAppTools("alice", runtime([work, home]), {
    required: async (_tool, accountId) => {
      seen.push(accountId)
      return false
    },
    request: async () => ({ approvalId: "a", summary: "" }),
    claim: async () => undefined,
    complete: async () => {},
  })
  await tools.searchAppTools.execute!({ query: "mail" }, options)
  await tools.executeAppTool.execute!(
    { slug: readTool.slug, arguments: {}, accountId: "ca_work" },
    options
  )
  assert.deepEqual(seen, ["ca_work"])
})

test("an approved action runs only on the approved account", async () => {
  let executed = false
  const tools = createAppTools(
    "alice",
    runtime([work, home], {
      execute: async () => {
        executed = true
        return { resultType: "completed" }
      },
    }),
    {
      required: async () => false,
      request: async () => ({ approvalId: "a", summary: "" }),
      claim: async () => ({
        slug: readTool.slug,
        toolkit: "gmail",
        accountId: "ca_gone",
        input: {},
      }),
      complete: async () => {},
    }
  )
  const result = JSON.parse(
    String(await tools.runApprovedAction.execute!({ approvalId: "a" }, options))
  )
  assert.equal(result.code, "ACCOUNT_CHANGED")
  assert.equal(executed, false)
})

test("an expired credential becomes CONNECTION_EXPIRED with a reconnect hand-off", async () => {
  let calls = 0
  const tools = await loaded(
    runtime([work], {
      execute: async () => {
        calls++
        return {
          resultType: "failed",
          error: "401 Unauthorized: token has expired",
          logId: "log_1",
        }
      },
    })
  )
  const result = await run(tools)
  assert.equal(result.status, "failed")
  assert.equal(result.code, "CONNECTION_EXPIRED")
  assert.deepEqual(result.reconnect, { toolkit: "gmail" })
  assert.match(result.message, /askUser/)
  assert.match(result.message, /Don't retry/)
  assert.equal(result.logId, "log_1")
  // The run remembers it: no second call at the dead account
  const again = await run(tools)
  assert.equal(again.code, "CONNECTION_EXPIRED")
  assert.equal(calls, 1)
})

test("a thrown 401 or missing connected account is also a reconnect", async () => {
  const expired = Object.assign(new Error("Request failed"), { status: 401 })
  const tools = await loaded(
    runtime([work], {
      execute: async () => {
        throw expired
      },
    })
  )
  assert.equal((await run(tools)).code, "CONNECTION_EXPIRED")
  assert.equal(
    classifyThrown(
      Object.assign(new Error("no account"), {
        name: "ComposioConnectedAccountNotFoundError",
      })
    ),
    "connection_expired"
  )
})

test("a missing scope asks for a reconnect without flagging the connection", async () => {
  const tools = await loaded(
    runtime([work], {
      execute: async () => ({
        resultType: "failed",
        error: "Insufficient permissions: missing required scope gmail.send",
      }),
    })
  )
  const result = await run(tools)
  assert.equal(result.code, "INSUFFICIENT_PERMISSIONS")
  assert.deepEqual(result.reconnect, { toolkit: "gmail" })
  // Reads on the same connection still run
  assert.equal((await run(tools)).code, "INSUFFICIENT_PERMISSIONS")
})

test("a provider 5xx or timeout is an unknown outcome that says to verify first", async () => {
  const server = await loaded(
    runtime([work], {
      execute: async () => ({
        resultType: "failed",
        error: "Bad gateway",
        data: { status_code: 502 },
      }),
    })
  )
  const failed = await run(server)
  assert.equal(failed.status, "unknown")
  assert.equal(failed.code, "OUTCOME_UNKNOWN")
  assert.match(failed.message, /Verify the external state/)

  const timeout = await loaded(
    runtime([work], {
      execute: async () => {
        throw new Error("The operation timed out")
      },
    })
  )
  const thrown = await run(timeout)
  assert.equal(thrown.status, "unknown")
  assert.equal(thrown.code, "OUTCOME_UNKNOWN")
  assert.match(thrown.message, /Verify the external state/)
  assert.equal(thrown.reconnect, undefined)
})

test("an ordinary provider error stays a plain failure", async () => {
  const tools = await loaded(
    runtime([work], {
      execute: async () => ({
        resultType: "failed",
        error: "Message not found",
        data: { status_code: 404 },
      }),
    })
  )
  const result = await run(tools)
  assert.equal(result.status, "failed")
  assert.equal(result.code, undefined)
  assert.equal(result.reconnect, undefined)
})

test("classification leaves unrelated words alone", () => {
  for (const error of [
    "Spreadsheet not found",
    "Event 4010 was deleted",
    "Rate limit reached, retry later",
    "The user is not authorized to view this folder",
  ])
    assert.equal(classifyEnvelope({ error }), "other", error)
  assert.equal(
    classifyEnvelope({
      error: "invalid_grant: Token has been expired or revoked",
    }),
    "connection_expired"
  )
  assert.equal(
    classifyEnvelope({ data: { status_code: 503 } }),
    "unknown_outcome"
  )
})

test("a missing tool is never read as the app being unavailable", async () => {
  const tools = createAppTools(
    "alice",
    runtime([work], { schema: async () => undefined })
  )
  const result = JSON.parse(
    String(
      await tools.getAppToolSchema.execute!({ slug: "GMAIL_NOPE" }, options)
    )
  )
  assert.equal(result.code, "TOOL_NOT_AVAILABLE")
  assert.match(result.message, /doesn't prove/)
  assert.match(result.message, /computer/)
  const empty = createAppTools(
    "alice",
    runtime([work], { search: async () => ({ tools: [], guidance: {} }) })
  )
  const search = JSON.parse(
    String(await empty.searchAppTools.execute!({ query: "x" }, options))
  )
  assert.match(search.message, /One narrow search proves nothing/)
})

test("a pending connection holds the free slot only while its attempt can finish", () => {
  const now = Date.parse("2026-10-16T12:00:00Z")
  const ago = (ms: number) => new Date(now - ms).toISOString()
  assert.equal(holdsAppSlot({ status: "ACTIVE" }, now), true)
  assert.equal(
    holdsAppSlot({ status: "INITIATED", createdAt: ago(60_000) }, now),
    true
  )
  assert.equal(
    holdsAppSlot({ status: "INITIATED", createdAt: ago(11 * 60_000) }, now),
    false
  )
  assert.equal(holdsAppSlot({ status: "INITIATED" }, now), true)
  assert.equal(
    holdsAppSlot({ status: "EXPIRED", createdAt: ago(1) }, now),
    false
  )
})

test("one expired account doesn't block the person's other account for the app", async () => {
  const used: string[] = []
  let failWork = true
  const tools = await loaded(
    runtime([work, home], {
      execute: async (_user, _slug, _input, account) => {
        used.push(account.id)
        return account.id === "ca_work" && failWork
          ? { resultType: "failed", error: "invalid_grant: token revoked" }
          : { resultType: "completed" }
      },
    })
  )
  const expired = await run(tools, { accountId: "ca_work" })
  assert.equal(expired.code, "CONNECTION_EXPIRED")
  assert.equal(expired.accountId, "ca_work")
  // The healthy sibling runs
  failWork = false
  const healthy = await run(tools, { accountId: "ca_home" })
  assert.equal(healthy.status, "succeeded")
  assert.equal(healthy.accountId, "ca_home")
  // The dead one isn't called again
  const again = await run(tools, { accountId: "ca_work" })
  assert.equal(again.code, "CONNECTION_EXPIRED")
  assert.deepEqual(used, ["ca_work", "ca_home"])
})

test("when the only account expired, the app reads as expired, not disconnected", async () => {
  let accounts = [work]
  const tools = await loaded(
    runtime([work], {
      accounts: async () => accounts,
      execute: async () => ({
        resultType: "failed",
        error: "401 Unauthorized",
      }),
    })
  )
  assert.equal((await run(tools)).code, "CONNECTION_EXPIRED")
  // activeAccounts hides the rejected account, as in production
  accounts = []
  const result = await run(tools)
  assert.equal(result.code, "CONNECTION_EXPIRED")
  assert.deepEqual(result.reconnect, { toolkit: "gmail" })
})

test("a missing permission leaves the account usable and flags the app as limited", async () => {
  const { expiredToolkits, limitedToolkits } =
    await import("../lib/connection-health")
  let calls = 0
  const tools = await loaded(
    runtime([work], {
      execute: async () => {
        calls++
        return calls === 1
          ? { resultType: "failed", error: "Insufficient permissions" }
          : { resultType: "completed" }
      },
    })
  )
  assert.equal((await run(tools)).code, "INSUFFICIENT_PERMISSIONS")
  assert.deepEqual([...limitedToolkits("alice")], ["gmail"])
  assert.equal(expiredToolkits("alice").size, 0)
  // Read access still works
  assert.equal((await run(tools)).status, "succeeded")
})

test("rejections are per account and per person, expire, and a dead credential outranks a missing permission", async () => {
  const health = await import("../lib/connection-health")
  const now = 1_000_000
  health.flagAccountRejected("alice", "gmail", "ca_work", "expired", now)
  assert.equal(health.accountExpired("alice", "ca_work", now + 1), true)
  assert.equal(health.accountExpired("alice", "ca_home", now + 1), false)
  assert.equal(health.accountExpired("bob", "ca_work", now + 1), false)
  health.flagAccountRejected("alice", "gmail", "ca_work", "insufficient", now)
  assert.equal(health.limitedToolkits("alice", now + 1).size, 0)
  assert.equal(
    health.accountExpired(
      "alice",
      "ca_work",
      now + health.CONNECTION_FLAG_MS + 1
    ),
    false
  )
})
