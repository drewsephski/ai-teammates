import assert from "node:assert/strict"
import test from "node:test"

import {
  LEASE_TTL_MS,
  busyResult,
  isLeaseHolderGone,
  leaseDecision,
  leaseExpiry,
  leaseRunId,
  type Lease,
} from "../lib/computer-lease-policy"

const now = 1_000_000
const me = { runKey: "ai:run_2:1", botId: "bot_b", chatId: "chat_b" }
const free: Lease = { runKey: null, botId: null, chatId: null, expiresAt: null }
const heldByOther = (expiresAt: number): Lease => ({
  runKey: "ai:run_1:1",
  botId: "bot_a",
  chatId: "chat_a",
  expiresAt: new Date(expiresAt),
})

test("a free lease is taken", () => {
  assert.equal(leaseDecision(free, me, now), "take")
})

test("the same turn renews, even after its lease lapsed", () => {
  const own: Lease = { ...heldByOther(now + 1), runKey: me.runKey }
  assert.equal(leaseDecision(own, me, now), "renew")
  assert.equal(
    leaseDecision({ ...own, expiresAt: new Date(now - 1) }, me, now),
    "renew"
  )
})

test("another turn waits while the lease is live", () => {
  assert.equal(leaseDecision(heldByOther(now + 1), me, now), "wait")
})

test("an expired lease is taken over", () => {
  assert.equal(leaseDecision(heldByOther(now), me, now), "take")
  assert.equal(leaseDecision(heldByOther(now - 1), me, now), "take")
})

test("after release another turn takes it", () => {
  assert.equal(leaseDecision(free, me, now), "take")
})

test("the lease lapses two minutes after the last call", () => {
  assert.equal(leaseExpiry(now).getTime(), now + LEASE_TTL_MS)
  assert.equal(LEASE_TTL_MS, 120_000)
})

test("a lease that stays held ends busy with the holder's name", () => {
  assert.deepEqual(busyResult("Quill"), { status: "busy", heldBy: "Quill" })
})

test("a long call's lease outlasts the call", () => {
  assert.equal(leaseExpiry(now).getTime(), now + LEASE_TTL_MS)
  assert.equal(
    leaseExpiry(now, 630_000).getTime(),
    now + 630_000 + LEASE_TTL_MS
  )
  assert.equal(leaseExpiry(now, -5).getTime(), now + LEASE_TTL_MS)
})

test("the run holding a lease is read from its ledger key", () => {
  assert.equal(
    leaseRunId("ai:run_06gkm209otomj7g648smblc501:0"),
    "run_06gkm209otomj7g648smblc501"
  )
  assert.equal(leaseRunId("ai:run_1:12"), "run_1")
  assert.equal(leaseRunId("run_1"), undefined)
  assert.equal(leaseRunId("ai::0"), undefined)
  assert.equal(leaseRunId("ai:run_1"), undefined)
})

test("a lease whose run died is freed at once; a live turn's is kept", () => {
  const held = { expiresAt: new Date(now + LEASE_TTL_MS) }
  const lapsed = { expiresAt: new Date(now - 1) }
  // Cancelled, crashed, out of time: nothing will ever release it
  for (const status of [
    "CANCELED",
    "CRASHED",
    "SYSTEM_FAILURE",
    "FAILED",
    "TIMED_OUT",
    "EXPIRED",
    "COMPLETED",
  ]) {
    assert.equal(isLeaseHolderGone(held, status, now), true, status)
    assert.equal(isLeaseHolderGone(lapsed, status, now), true, status)
  }
  // A turn between computer calls keeps the computer, even past the lease
  assert.equal(isLeaseHolderGone(held, "EXECUTING", now), false)
  assert.equal(isLeaseHolderGone(lapsed, "EXECUTING", now), false)
  // A run waiting between turns released its lease when its turn ended, so a
  // lapsed one it still names was left behind
  assert.equal(isLeaseHolderGone(held, "WAITING", now), false)
  assert.equal(isLeaseHolderGone(lapsed, "WAITING", now), true)
  // Unknown (lookup failed, another environment's run): never act on a guess
  assert.equal(isLeaseHolderGone(lapsed, undefined, now), false)
  assert.equal(isLeaseHolderGone(lapsed, "SOMETHING_NEW", now), false)
})
