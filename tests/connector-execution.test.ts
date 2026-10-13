import assert from "node:assert/strict"
import test from "node:test"
import { executeConnectedAppTool } from "../lib/connector-execution"

test("single-account projects pin the owned account in the session without a per-call selector", async () => {
  const account = { id: "alice-gmail", toolkit: "gmail" }
  const result = await executeConnectedAppTool(
    async (userId, toolkits, connectedAccounts) => {
      assert.equal(userId, "alice")
      assert.deepEqual(toolkits, ["gmail"])
      assert.deepEqual(connectedAccounts, { gmail: ["alice-gmail"] })
      return {
        execute: async (
          ...args: [string, Record<string, unknown>, unknown?]
        ) => {
          if (args.length > 2)
            throw new Error("Multi-account selection is not enabled")
          assert.deepEqual(args, ["GMAIL_GET_PROFILE", { user_id: "me" }])
          return { successful: true }
        },
      }
    },
    "alice",
    "GMAIL_GET_PROFILE",
    { user_id: "me" },
    account
  )
  assert.deepEqual(result, { successful: true })
})

test("an aborted request cannot create a session or execute after session creation", async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    () =>
      executeConnectedAppTool(
        async () => {
          throw new Error("Must not create a session")
        },
        "alice",
        "GMAIL_GET_PROFILE",
        {},
        { id: "gmail", toolkit: "gmail" },
        controller.signal
      ),
    { name: "AbortError" }
  )

  const duringCreation = new AbortController()
  let executed = false
  await assert.rejects(
    () =>
      executeConnectedAppTool(
        async () => {
          duringCreation.abort()
          return {
            execute: async () => {
              executed = true
            },
          }
        },
        "alice",
        "GMAIL_GET_PROFILE",
        {},
        { id: "gmail", toolkit: "gmail" },
        duringCreation.signal
      ),
    { name: "AbortError" }
  )
  assert.equal(executed, false)
})
