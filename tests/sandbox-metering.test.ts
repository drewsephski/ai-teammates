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

test("owners come from computers: an old per-bot sandbox is an orphan", async () => {
  const killed: string[] = []
  const paused: string[] = []
  const day = 25 * 3_600_000
  const output = await runSandboxMetering({
    // sbx_old was a bot's computer; no computers row points at it
    list: async () => [computer("sbx_account"), computer("sbx_old", day)],
    owners: async () => [{ sandboxId: "sbx_account", userId: "user" }],
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
  assert.deepEqual(killed, ["sbx_old"])
  assert.deepEqual(paused, [])
  assert.deepEqual(output, { metered: 1, missing: 0, paused: 0, removed: 1 })
})

const retentionRow = (sandboxId: string, userId: string, age: number) => ({
  userId,
  sandboxId,
  lastUsedAt: new Date(Date.now() - age),
  createdAt: new Date(Date.now() - 100 * 24 * 3_600_000),
  leaseExpiresAt: null,
})
const days = (n: number) => n * 24 * 3_600_000

function retentionRun(options: {
  rows: ReturnType<typeof retentionRow>[]
  listed: ReturnType<typeof computer>[]
  tiers: Record<string, "free" | "paid" | Error>
  expired?: string[]
  reports?: unknown[]
}) {
  return runSandboxMetering({
    list: async () => options.listed,
    owners: async () =>
      options.rows.map(({ sandboxId, userId }) => ({ sandboxId, userId })),
    meter: async () => true,
    hasUsage: async () => true,
    pause: async () => {},
    report: (error) => void options.reports?.push(error),
    retention: {
      rows: async () => options.rows,
      tier: async (userId) => {
        const tier = options.tiers[userId]
        if (tier instanceof Error) throw tier
        return tier
      },
      expire: async (row) => {
        options.expired?.push(row.sandboxId)
        return true
      },
    },
  })
}

test("retention deletes only old, paused, free-plan computers", async () => {
  const expired: string[] = []
  const output = await retentionRun({
    rows: [
      retentionRow("free-old", "free", days(31)),
      retentionRow("paid-old", "paid", days(31)),
      retentionRow("free-new", "free2", days(5)),
      retentionRow("free-running", "free3", days(40)),
    ],
    listed: [
      computer("free-old", days(31), "paused"),
      computer("paid-old", days(31), "paused"),
      computer("free-new", days(5), "paused"),
      computer("free-running", days(40), "running"),
    ],
    tiers: { free: "free", paid: "paid", free2: "free", free3: "free" },
    expired,
  })
  assert.deepEqual(expired, ["free-old"])
  assert.equal(output.expired, 1)
})

test("a plan lookup that fails skips that account and never deletes it", async () => {
  const expired: string[] = []
  const reports: unknown[] = []
  const output = await retentionRun({
    rows: [
      retentionRow("down", "down", days(45)),
      retentionRow("ok", "ok", days(45)),
    ],
    listed: [
      computer("down", days(45), "paused"),
      computer("ok", days(45), "paused"),
    ],
    tiers: { down: new Error("clerk down"), ok: "free" },
    expired,
    reports,
  })
  assert.deepEqual(expired, ["ok"])
  assert.equal(reports.length, 1)
  // Not a failed run: the account is simply left for the next one
  assert.equal(output.expired, 1)
})

test("runs without retention report no expired count and ask for no plans", async () => {
  const output = await runSandboxMetering({
    list: async () => [],
    owners: async () => [],
    meter: async () => true,
    hasUsage: async () => true,
    pause: async () => {},
    report: () => {},
  })
  assert.equal("expired" in output, false)
})
