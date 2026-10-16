import assert from "node:assert/strict"
import test from "node:test"
import { setImmediate } from "node:timers/promises"

import { runSandboxMetering } from "../lib/sandbox-metering"

test("both metering and quota pauses stay within four concurrent provider calls", async () => {
  const owners = Array.from({ length: 20 }, (_, i) => ({
    sandboxId: String(i),
    userId: String(i % 5),
  }))
  let active = 0
  let peak = 0
  async function providerCall() {
    active++
    peak = Math.max(peak, active)
    await setImmediate()
    active--
  }
  const output = await runSandboxMetering({
    list: async () => owners.map((owner) => computer(owner.sandboxId)),
    owners: async () => owners,
    meter: async () => {
      await providerCall()
      return true
    },
    hasUsage: async () => false,
    pause: providerCall,
    report: () => {},
  })
  assert.equal(peak, 4)
  assert.deepEqual(output, { metered: 20, missing: 0, paused: 20, removed: 0 })
})

function computer(
  sandboxId: string,
  age = 0,
  state: "running" | "paused" = "running"
) {
  return {
    sandboxId,
    state,
    startedAt: new Date(Date.now() - age),
    endAt: new Date(Date.now() - age + 60_000),
  }
}

test("one failing computer does not prevent other metering or quota enforcement", async () => {
  const metered: string[] = []
  const paused: string[] = []
  const reported: string[] = []
  await assert.rejects(
    runSandboxMetering({
      list: async () => [computer("broken"), computer("healthy")],
      owners: async () => [
        { sandboxId: "broken", userId: "first" },
        { sandboxId: "healthy", userId: "second" },
      ],
      meter: async ({ sandboxId }) => {
        if (sandboxId === "broken") throw new Error("provider unavailable")
        metered.push(sandboxId)
        return true
      },
      hasUsage: async () => false,
      pause: async (id) => {
        paused.push(id)
      },
      report: (_error, id) => {
        reported.push(id)
      },
    }),
    AggregateError
  )
  assert.deepEqual(metered, ["healthy"])
  assert.ok(paused.includes("healthy"))
  assert.deepEqual(reported, ["broken"])
})

test("billing failure for one account does not skip another account", async () => {
  const paused: string[] = []
  await assert.rejects(
    runSandboxMetering({
      list: async () => [computer("a"), computer("b")],
      owners: async () => [
        { sandboxId: "a", userId: "a" },
        { sandboxId: "b", userId: "b" },
      ],
      meter: async () => true,
      hasUsage: async (id) => {
        if (id === "a") throw new Error("billing unavailable")
        return false
      },
      pause: async (id) => {
        paused.push(id)
      },
      report: () => {},
    }),
    AggregateError
  )
  assert.deepEqual(paused, ["b"])
})

test("new provisioning is spared, older orphan compute is paused, missing VMs are counted", async () => {
  const paused: string[] = []
  const output = await runSandboxMetering({
    list: async () => [
      computer("creating"),
      computer("orphan", 600_000),
      computer("already-paused", 600_000, "paused"),
    ],
    owners: async () => [{ sandboxId: "missing", userId: "owner" }],
    meter: async () => false,
    hasUsage: async () => true,
    pause: async (id) => {
      paused.push(id)
    },
    report: () => {},
  })
  assert.deepEqual(paused, ["orphan"])
  assert.deepEqual(output, { metered: 0, missing: 1, paused: 1, removed: 0 })
})

test("quota enforcement rechecks even a VM that was paused at list time", async () => {
  const paused: string[] = []
  await runSandboxMetering({
    list: async () => [computer("resumed-after-list", 0, "paused")],
    owners: async () => [{ sandboxId: "resumed-after-list", userId: "owner" }],
    meter: async () => true,
    hasUsage: async () => false,
    pause: async (id) => {
      paused.push(id)
    },
    report: () => {},
  })
  assert.deepEqual(paused, ["resumed-after-list"])
})

test("dormant paused computers cost no provider or billing calls", async () => {
  const calls: string[] = []
  const output = await runSandboxMetering({
    list: async () => [
      computer("dormant", 3 * 86_400_000, "paused"),
      computer("busy"),
    ],
    owners: async () => [
      { sandboxId: "dormant", userId: "sleepy" },
      { sandboxId: "busy", userId: "active" },
    ],
    meter: async ({ sandboxId }) => {
      calls.push(`meter:${sandboxId}`)
      return true
    },
    hasUsage: async (userId) => {
      calls.push(`usage:${userId}`)
      return true
    },
    pause: async () => {},
    report: () => {},
  })
  assert.deepEqual(calls, ["meter:busy", "usage:active"])
  assert.deepEqual(output, { metered: 1, missing: 0, paused: 0, removed: 0 })
})

test("orphans older than a day are deleted, younger running ones paused", async () => {
  const killed: string[] = []
  const paused: string[] = []
  const output = await runSandboxMetering({
    list: async () => [
      computer("old-paused", 2 * 86_400_000, "paused"),
      computer("old-running", 2 * 86_400_000),
      computer("young", 600_000),
      computer("young-paused", 600_000, "paused"),
    ],
    owners: async () => [],
    meter: async () => true,
    hasUsage: async () => true,
    pause: async (id) => {
      paused.push(id)
    },
    kill: async (id) => {
      killed.push(id)
    },
    report: () => {},
  })
  assert.deepEqual(killed.sort(), ["old-paused", "old-running"])
  assert.deepEqual(paused, ["young"])
  assert.deepEqual(output, { metered: 0, missing: 0, paused: 1, removed: 2 })
})
