import assert from "node:assert/strict"
import { after, before, test } from "node:test"

import { startTestDatabase } from "./helpers/test-db"

let database: Awaited<ReturnType<typeof startTestDatabase>>
let tools: typeof import("../lib/sandbox-tools")
let policy: typeof import("../lib/computer-lease-policy")

before(async () => {
  // lib/e2b.ts imports @/db, which must see the test database
  database = await startTestDatabase()
  tools = await import("../lib/sandbox-tools")
  policy = await import("../lib/computer-lease-policy")
})
after(async () => {
  await database?.stop()
})

const call = { toolCallId: "t", messages: [], context: {} }

test("a busy computer is reported without touching it", async () => {
  let viewed = 0
  const set = tools.createSandboxTools(
    async () => policy.busyResult("Researcher"),
    { onScreenViewed: () => void viewed++ }
  )
  const ran = await set.bash.execute!({ command: "ls", timeout: 60 }, call)
  assert.deepEqual(ran, { status: "busy", heldBy: "Researcher" })
  assert.equal(policy.isComputerBusy(ran), true)

  const screen = await set.viewScreen.execute!({}, call)
  assert.equal(policy.isComputerBusy(screen), true)
  // A busy screen was never looked at, so sign-in can't count it
  assert.equal(viewed, 0)
  const model = await set.viewScreen.toModelOutput!({
    toolCallId: "t",
    input: {},
    output: screen as never,
  })
  assert.equal(model.type, "text")
  if (model.type === "text") assert.match(model.value, /Researcher is using it/)
})

test("busy results are recognised only by their shape", () => {
  assert.equal(policy.isComputerBusy({ status: "busy", heldBy: "X" }), true)
  for (const output of [
    null,
    "busy",
    { exitCode: 0, output: "" },
    { status: "succeeded" },
  ])
    assert.equal(policy.isComputerBusy(output), false)
})

test("a short call never shortens a long call's lease in the same step", async () => {
  const holds: number[] = []
  let releaseFirst: (value: {
    status: "busy"
    heldBy: string
  }) => void = () => {}
  let calls = 0
  const set = tools.createSandboxTools((holdMs = 0) => {
    holds.push(holdMs)
    calls++
    if (calls === 1)
      return new Promise((resolve) => {
        releaseFirst = resolve
      })
    return policy.busyResult("Researcher")
  })
  const long = set.bash.execute!({ command: "sleep 500", timeout: 600 }, call)
  await set.viewScreen.execute!({}, call)
  releaseFirst(policy.busyResult("Researcher"))
  await long
  assert.equal(holds[0], 630_000)
  // The screenshot renewed while the command was still holding the computer
  assert.ok(holds[1] > 600_000, `hold was ${holds[1]}`)
  // Once nothing is running, a call holds only for itself
  await set.viewScreen.execute!({}, call)
  assert.equal(holds[2], 0)
})

test("a busy call doesn't renew a lease it never had", async () => {
  let renewed = 0
  const set = tools.createSandboxTools(
    async () => policy.busyResult("Researcher"),
    { afterCall: () => void renewed++ }
  )
  await set.bash.execute!({ command: "ls", timeout: 60 }, call)
  assert.equal(renewed, 0)
})
