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
// Lets every gesture through; the gate itself is tested in
// tests/computer-approval-tools.test.ts
const open = {
  gesture: async () => ({}),
  shell: async () => ({}),
  complete: async () => {},
}

test("a busy computer is reported without touching it", async () => {
  let viewed = 0
  const set = tools.createSandboxTools(
    async () => policy.busyResult("Researcher"),
    open,
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
  }, open)
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
    open,
    { afterCall: () => void renewed++ }
  )
  await set.bash.execute!({ command: "ls", timeout: 60 }, call)
  assert.equal(renewed, 0)
})

test("a held shell command is refused before the computer is touched", async () => {
  const gate = await import("../lib/computer-approval-tools")
  let touched = 0
  const set = tools.createSandboxTools(
    () => {
      touched++
      throw new Error("The computer was touched")
    },
    gate.createComputerGate({
      store: {
        request: async () => ({ approvalId: "x", summary: "x" }),
        read: async () => undefined,
        spend: async () => false,
        complete: async () => {},
      },
      check: async () => {
        throw new Error("no guard here")
      },
      takeScreenshot: async () => {
        throw new Error("no screen here")
      },
    })
  )
  await assert.rejects(
    Promise.resolve(
      set.bash.execute!({ command: "xdotool click 1", timeout: 60 }, call)
    ),
    /isn't allowed/
  )
  await assert.rejects(
    Promise.resolve(
      set.bash.execute!({ command: "git push origin main", timeout: 60 }, call)
    ),
    /Approval required/
  )
  assert.equal(touched, 0)
})

test("a key name can't smuggle a shell command to the computer", () => {
  const set = tools.createSandboxTools(() => "unused", open)
  const schema = set.keyboardPress.inputSchema as unknown as {
    safeParse: (value: unknown) => { success: boolean }
  }
  assert.equal(schema.safeParse({ key: "Return" }).success, true)
  assert.equal(schema.safeParse({ key: "KP_Enter" }).success, true)
  for (const key of ["tab;curl x", "a b", "$(id)", "Return`id`", ""])
    assert.equal(schema.safeParse({ key }).success, false, key)
})

test("saved keys are redacted from what the model reads, before truncating", () => {
  const secrets = { OPENAI_API_KEY: "sk-live-abcdef1234567890" }
  assert.equal(
    tools.modelText(`key=${secrets.OPENAI_API_KEY}\n`, secrets),
    "key=[secret OPENAI_API_KEY]\n"
  )
  // A value straddling the length limit is still hidden whole, not cut in two
  const padded = `${"x".repeat(19_990)}${secrets.OPENAI_API_KEY}${"y".repeat(100)}`
  const text = tools.modelText(padded, secrets)
  assert.equal(text.includes("sk-live"), false)
  assert.match(text, /\[secret OP/)
  assert.match(text, /truncated \d+ more characters/)
  // Without keys the text only gets truncated
  assert.equal(tools.modelText("plain"), "plain")
})

test("a command gets the saved keys as environment variables", async () => {
  const { runSandboxCommand } = await import("../lib/e2b")
  const runs: { command: string; options: Record<string, unknown> }[] = []
  const result = { exitCode: 0, stdout: "ok", stderr: "" }
  const sandbox = {
    commands: {
      run: async (command: string, options: Record<string, unknown>) => {
        runs.push({ command, options })
        return options.background
          ? { wait: async () => result, kill: async () => true }
          : result
      },
    },
  } as unknown as Parameters<typeof runSandboxCommand>[0]
  const envs = { OPENAI_API_KEY: "sk-live-abcdef1234567890" }

  await runSandboxCommand(sandbox, "env", undefined, 1000, undefined, envs)
  await runSandboxCommand(
    sandbox,
    "env",
    undefined,
    1000,
    new AbortController().signal,
    envs
  )
  // Existing callers pass no keys
  await runSandboxCommand(sandbox, "ls")
  assert.deepEqual(runs[0].options.envs, envs)
  assert.deepEqual(runs[1].options.envs, envs)
  assert.equal(runs[1].options.background, true)
  assert.equal(runs[2].options.envs, undefined)
})
