import assert from "node:assert/strict"
import test from "node:test"
import type { ToolRouterSessionSearchResponse } from "@composio/core"
import { createSessionRuntime } from "../lib/connector-session"

const account = { id: "alice-gmail", toolkit: "gmail" }
const searchResult: ToolRouterSessionSearchResponse = {
  success: true,
  error: null,
  results: [
    {
      index: 1,
      useCase: "send a draft",
      primaryToolSlugs: ["GMAIL_SEND_DRAFT"],
      relatedToolSlugs: [],
      toolkits: ["GMAIL"],
      recommendedPlanSteps: ["Use the actual draft ID"],
      knownPitfalls: ["A message ID is not a draft ID"],
    },
  ],
  toolSchemas: {
    GMAIL_SEND_DRAFT: {
      toolSlug: "GMAIL_SEND_DRAFT",
      toolkit: "GMAIL",
      hasFullSchema: true,
      inputSchema: { type: "object", required: ["draft_id"] },
    },
  },
  toolkitConnectionStatuses: [],
  nextStepsGuidance: ["Load related schemas"],
  session: { id: "workflow", generateId: true, instructions: "Reuse workflow" },
  timeInfo: {
    currentTimeUtc: "2026-10-13T00:00:00Z",
    currentTimeUtcEpochSeconds: 0,
    message: "Use UTC",
  },
}

test("discovery, exact lookup and execution share an account-pinned session and cancellation", async () => {
  let created = 0
  const signal = new AbortController().signal
  const calls: string[] = []
  const runtime = createSessionRuntime(
    "alice",
    async () => [account],
    async (user, toolkits, bindings) => {
      created++
      assert.equal(user, "alice")
      assert.deepEqual(toolkits, ["gmail"])
      assert.deepEqual(bindings, { gmail: [account.id] })
      return {
        search: async (params, options) => {
          assert.deepEqual(params, {
            query: "send a Gmail draft",
            toolkits: ["gmail"],
          })
          assert.equal(options?.signal, signal)
          return searchResult
        },
        execute: async (slug, input, selector, options) => {
          assert.equal(selector, undefined)
          assert.equal(options?.signal, signal)
          calls.push(slug)
          if (slug === "COMPOSIO_GET_TOOL_SCHEMAS") {
            assert.deepEqual(input, {
              tool_slugs: ["GMAIL_SEND_DRAFT"],
              include: ["input_schema", "output_schema"],
            })
            return {
              resultType: "completed",
              error: null,
              data: {
                tool_schemas: {
                  GMAIL_SEND_DRAFT: {
                    toolkit: "GMAIL",
                    input_schema: { type: "object", required: ["draft_id"] },
                    output_schema: { type: "object" },
                  },
                },
              },
            }
          }
          assert.deepEqual(input, { draft_id: "r-real" })
          return {
            resultType: "completed",
            error: null,
            data: { id: "sent-id" },
          }
        },
      }
    }
  )
  const search = await runtime.search("send a Gmail draft", [account], signal)
  assert.equal(search.tools[0].toolkit, "gmail")
  assert.match(
    JSON.stringify(search.guidance),
    /A message ID is not a draft ID/
  )
  const schema = await runtime.schema("GMAIL_SEND_DRAFT", [account], signal)
  assert.equal(schema?.toolkit, "gmail")
  assert.deepEqual(schema?.outputSchema, { type: "object" })
  await runtime.execute(
    "alice",
    "GMAIL_SEND_DRAFT",
    { draft_id: "r-real" },
    account,
    signal
  )
  assert.deepEqual(calls, ["COMPOSIO_GET_TOOL_SCHEMAS", "GMAIL_SEND_DRAFT"])
  assert.equal(created, 1)
})

test("aborted calls never create sessions or execute after creation", async () => {
  const controller = new AbortController()
  let called = false
  const runtime = createSessionRuntime(
    "alice",
    async () => [account],
    async () => {
      called = true
      throw new Error("must not create")
    }
  )
  controller.abort()
  await assert.rejects(
    () => runtime.search("send", [account], controller.signal),
    { name: "AbortError" }
  )
  assert.equal(called, false)

  const during = new AbortController()
  const second = createSessionRuntime(
    "alice",
    async () => [account],
    async () => {
      during.abort()
      return {
        search: async () => searchResult,
        execute: async () => {
          called = true
        },
      }
    }
  )
  await assert.rejects(
    () =>
      second.execute("alice", "GMAIL_SEND_DRAFT", {}, account, during.signal),
    { name: "AbortError" }
  )
  assert.equal(called, false)
})

test("session scope changes on disconnect and rejects cross-user execution", async () => {
  let owned = [account]
  let executed = false
  const runtime = createSessionRuntime(
    "alice",
    async () => owned,
    async () => ({
      search: async () => searchResult,
      execute: async () => {
        executed = true
      },
    })
  )
  await runtime.search("send", owned)
  owned = []
  await assert.rejects(
    () => runtime.execute("alice", "GMAIL_SEND_DRAFT", {}, account),
    /no longer available/
  )
  await assert.rejects(
    () => runtime.execute("bob", "GMAIL_SEND_DRAFT", {}, account),
    /owner mismatch/
  )
  assert.equal(executed, false)
})

test("partial discovery schemas require exact lookup rather than execution", async () => {
  const partial = structuredClone(searchResult)
  partial.toolSchemas.GMAIL_SEND_DRAFT.hasFullSchema = false
  const runtime = createSessionRuntime(
    "alice",
    async () => [account],
    async () => ({
      search: async () => partial,
      execute: async () => ({ resultType: "failed", data: {} }),
    })
  )
  const result = await runtime.search("send", [account])
  assert.equal(result.tools[0].inputSchema, undefined)
  assert.equal(await runtime.schema("GMAIL_SEND_DRAFT", [account]), undefined)
})

test("an account added ahead of the selected account cannot silently change the sender", async () => {
  const owned = [{ id: "new-first-account", toolkit: "gmail" }, account]
  let created = false
  const runtime = createSessionRuntime(
    "alice",
    async () => owned,
    async () => {
      created = true
      throw new Error("must not create")
    }
  )
  await assert.rejects(
    () => runtime.execute("alice", "GMAIL_SEND_DRAFT", {}, account),
    /no longer available/
  )
  assert.equal(created, false)
})
