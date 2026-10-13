import assert from "node:assert/strict"
import test from "node:test"
import {
  SandboxNotFoundError,
  type Sandbox,
  type SandboxInfo,
} from "@e2b/desktop"

import {
  createSandboxLifecycle,
  SandboxMissingError,
} from "../lib/sandbox-lifecycle"
import { IDLE_TIMEOUT_MS, SESSION_LIMIT_MS } from "../lib/sandbox-policy"

function setup() {
  let info: SandboxInfo = {
    sandboxId: "computer",
    templateId: "desktop",
    metadata: {},
    startedAt: new Date(),
    endAt: new Date(Date.now() + IDLE_TIMEOUT_MS),
    state: "running",
    cpuCount: 2,
    memoryMB: 4096,
    envdVersion: "test",
  }
  const calls: string[] = []
  const reports: unknown[] = []
  const meters: SandboxInfo[] = []
  let busy = false
  let failCleanup = false
  let missing = false
  let failConnect = false
  let failFinalMeter = false
  let infoError: Error | undefined
  const sandbox = {
    setTimeout: async (timeout: number) => {
      calls.push(`timeout:${timeout}`)
      if (
        failCleanup &&
        calls.filter((call) => call.startsWith("timeout:")).length > 1
      )
        throw new Error("lease failed")
    },
  } as unknown as Sandbox
  const lifecycle = createSandboxLifecycle({
    getInfo: async () => {
      if (infoError) throw infoError
      if (missing) throw new SandboxNotFoundError("missing")
      return { ...info }
    },
    connect: async () => {
      calls.push("connect")
      if (failConnect) throw new Error("resume unavailable")
      if (info.state === "paused")
        info = { ...info, state: "running", startedAt: new Date() }
      return sandbox
    },
    pause: async () => {
      calls.push("pause")
      info = { ...info, state: "paused", endAt: new Date() }
    },
    meter: async (snapshot) => {
      if (failFinalMeter && meters.length === 2) throw new Error("meter failed")
      meters.push(snapshot)
    },
    lock: async (_id, operation) => operation(),
    tryLock: async (_id, operation) =>
      busy ? { acquired: false } : { acquired: true, value: await operation() },
    report: (error) => {
      reports.push(error)
    },
  })
  return {
    lifecycle,
    calls,
    reports,
    meters,
    get info() {
      return info
    },
    configure: (options: {
      busy?: boolean
      failCleanup?: boolean
      missing?: boolean
      failConnect?: boolean
      failFinalMeter?: boolean
      state?: "paused" | "running"
      age?: number
      infoError?: Error
    }) => {
      busy = options.busy ?? busy
      failCleanup = options.failCleanup ?? failCleanup
      missing = options.missing ?? missing
      failConnect = options.failConnect ?? failConnect
      failFinalMeter = options.failFinalMeter ?? failFinalMeter
      infoError = options.infoError ?? infoError
      info = {
        ...info,
        state: options.state ?? info.state,
        startedAt:
          options.age === undefined
            ? info.startedAt
            : new Date(Date.now() - options.age),
      }
    },
  }
}

test("successful side effects stay successful when both maintenance calls fail", async () => {
  const state = setup()
  state.configure({ failCleanup: true, failFinalMeter: true })
  let writes = 0
  assert.equal(await state.lifecycle.run("computer", async () => ++writes), 1)
  assert.equal(writes, 1)
  assert.equal(state.meters.length, 2)
  assert.equal(state.reports.length, 2)
})

test("maintenance failure preserves the original tool error", async () => {
  const state = setup()
  state.configure({ failCleanup: true, failFinalMeter: true })
  const original = new Error("tool failed")
  await assert.rejects(
    state.lifecycle.run("computer", async () => {
      throw original
    }),
    (error) => error === original
  )
  assert.equal(state.reports.length, 2)
})

test("metering completed before a resume failure stays recorded", async () => {
  const state = setup()
  state.configure({ failConnect: true, state: "paused" })
  await assert.rejects(
    state.lifecycle.run("computer", async () => {}),
    /resume unavailable/
  )
  assert.equal(state.meters.length, 1)
})

test("a fresh running session is not rotated for a ten-minute command", async () => {
  const state = setup()
  await state.lifecycle.run("computer", async () => {}, 630_000)
  assert.ok(!state.calls.includes("pause"))
})

test("a long command near the session ceiling rotates before starting", async () => {
  const state = setup()
  state.configure({ age: SESSION_LIMIT_MS - 60_000 })
  await state.lifecycle.run(
    "computer",
    async () => {
      assert.equal(state.info.state, "running")
    },
    630_000
  )
  assert.ok(state.calls.indexOf("pause") < state.calls.indexOf("connect"))
  assert.ok(state.meters.some((info) => info.state === "paused"))
})

test("a viewer never shortens an active command lease", async () => {
  const state = setup()
  state.configure({ busy: true })
  await state.lifecycle.renewDesktop("computer", state.info.startedAt)
  assert.deepEqual(state.calls, [])
})

test("viewers reject a paused or replaced session without resuming", async () => {
  const state = setup()
  const session = state.info.startedAt
  state.configure({ state: "paused" })
  await assert.rejects(
    state.lifecycle.renewDesktop("computer", session),
    /session ended/
  )
  state.configure({ state: "running", age: 1000 })
  await assert.rejects(
    state.lifecycle.renewDesktop("computer", session),
    /session ended/
  )
  assert.deepEqual(state.calls, [])
})

test("a viewer reaching the session limit pauses and requires reconnect", async () => {
  const state = setup()
  state.configure({ age: SESSION_LIMIT_MS - 1000 })
  await assert.rejects(
    state.lifecycle.renewDesktop("computer", state.info.startedAt),
    /session limit/
  )
  assert.deepEqual(state.calls, ["pause"])
})

test("missing computers are reported without silently replacing them", async () => {
  const state = setup()
  state.configure({ missing: true })
  await assert.rejects(
    state.lifecycle.run("computer", async () => {}),
    SandboxMissingError
  )
  assert.deepEqual(state.calls, [])
})

test("temporary provider failures do not become missing-computer errors", async () => {
  const state = setup()
  const original = new Error("provider timeout")
  state.configure({ infoError: original })
  await assert.rejects(
    state.lifecycle.getInfo("computer"),
    (error) => error === original
  )
  assert.deepEqual(state.calls, [])
})

test("an idle viewer renews its current session without pausing it", async () => {
  const state = setup()
  await state.lifecycle.renewDesktop("computer", state.info.startedAt)
  assert.equal(state.calls[0], "connect")
  assert.ok(state.calls[1].startsWith("timeout:"))
  assert.ok(!state.calls.includes("pause"))
})

test("passive operations cannot wake a paused computer", async () => {
  const state = setup()
  state.configure({ state: "paused" })
  await assert.rejects(
    state.lifecycle.run("computer", async () => {}, undefined, false),
    /Computer paused/
  )
  assert.deepEqual(state.calls, [])
})
