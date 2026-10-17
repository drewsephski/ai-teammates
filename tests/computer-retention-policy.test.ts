import assert from "node:assert/strict"
import test from "node:test"

import {
  FREE_RETENTION_DAYS,
  FREE_RETENTION_MS,
  RETENTION_BATCH,
  RETENTION_REMOVED_NOTICE,
  isRetentionExpired,
  retentionBatch,
  retentionCandidates,
  retentionDaysLeft,
  retentionWarning,
  shouldDeleteComputer,
  type RetentionRow,
} from "../lib/computer-retention-policy"

const now = Date.UTC(2026, 10, 20)
const day = 24 * 3_600_000
const row = (overrides: Partial<RetentionRow> = {}): RetentionRow => ({
  userId: "user",
  sandboxId: "sbx",
  lastUsedAt: new Date(now - 31 * day),
  createdAt: new Date(now - 90 * day),
  leaseExpiresAt: null,
  ...overrides,
})

test("a free computer is kept for exactly 30 days after its last use", () => {
  assert.equal(FREE_RETENTION_DAYS, 30)
  const at = (age: number) =>
    shouldDeleteComputer(
      "free",
      row({ lastUsedAt: new Date(now - age) }),
      "paused",
      now
    )
  assert.equal(at(FREE_RETENTION_MS - 1), false)
  assert.equal(at(FREE_RETENTION_MS), true)
  assert.equal(at(60 * day), true)
})

test("paid, unreadable and running computers are never deleted", () => {
  assert.equal(shouldDeleteComputer("paid", row(), "paused", now), false)
  // A Clerk failure leaves the plan unknown, and an unknown plan keeps files
  assert.equal(shouldDeleteComputer(undefined, row(), "paused", now), false)
  assert.equal(shouldDeleteComputer("free", row(), "running", now), false)
})

test("a lease that is still held keeps the computer, an expired one does not", () => {
  const held = row({ leaseExpiresAt: new Date(now + 1000) })
  assert.equal(isRetentionExpired(held, "paused", now), false)
  const lapsed = row({ leaseExpiresAt: new Date(now - 1000) })
  assert.equal(isRetentionExpired(lapsed, "paused", now), true)
})

test("a computer never used counts from its creation", () => {
  assert.equal(
    isRetentionExpired(
      row({ lastUsedAt: null, createdAt: new Date(now - 10 * day) }),
      "paused",
      now
    ),
    false
  )
  assert.equal(
    isRetentionExpired(row({ lastUsedAt: null }), "paused", now),
    true
  )
})

test("candidates are old, paused computers the provider still lists", () => {
  const rows = [
    row({ sandboxId: "old-paused" }),
    row({ sandboxId: "old-running" }),
    row({ sandboxId: "old-unlisted" }),
    row({ sandboxId: "recent", lastUsedAt: new Date(now - day) }),
  ]
  const listed = new Map<string, { state: "running" | "paused" }>([
    ["old-paused", { state: "paused" }],
    ["old-running", { state: "running" }],
    ["recent", { state: "paused" }],
  ])
  assert.deepEqual(
    retentionCandidates(rows, listed, now).map((r) => r.sandboxId),
    ["old-paused"]
  )
})

test("a batch is bounded and rotates through the candidates across runs", () => {
  const all = Array.from({ length: 60 }, (_, i) => i)
  assert.deepEqual(retentionBatch([1, 2, 3], now), [1, 2, 3])
  const first = retentionBatch(all, 0)
  const second = retentionBatch(all, 600_000)
  const third = retentionBatch(all, 1_200_000)
  assert.equal(first.length, RETENTION_BATCH)
  assert.deepEqual(first, all.slice(0, 25))
  assert.deepEqual(second, all.slice(25, 50))
  // Wraps around to the start, so nobody is skipped for good
  assert.deepEqual(third, [...all.slice(50), ...all.slice(0, 15)])
  // Runs inside one window pick the same batch
  assert.deepEqual(retentionBatch(all, 599_999), first)
})

test("days left counts down to the deletion day", () => {
  const used = (age: number) =>
    retentionDaysLeft(
      { lastUsedAt: new Date(now - age), createdAt: new Date(0) },
      now
    )
  assert.equal(used(0), 30)
  assert.equal(used(27 * day), 3)
  assert.equal(used(29.5 * day), 1)
  assert.equal(used(31 * day), null)
})

test("notice copy is plain and states the consequence", () => {
  assert.match(retentionWarning(3), /deleted in 3 days/)
  assert.match(retentionWarning(1), /deleted tomorrow/)
  assert.match(retentionWarning(3), /can't be recovered/)
  assert.equal(
    RETENTION_REMOVED_NOTICE,
    "Your free computer was deleted after 30 days without use, so this one starts empty."
  )
})
