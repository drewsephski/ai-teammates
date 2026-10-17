import assert from "node:assert/strict"
import test from "node:test"

import {
  COMPUTER_TIME_USED_UP_ERRORS,
  COMPUTERS_BUSY_ERROR,
  DESKTOP_CLOSE,
  FREE_COMPUTER_CALLS_PER_TURN,
  IDLE_TIMEOUT_MS,
  LOW_ALLOWANCE_SECONDS,
  MIN_IDLE_TIMEOUT_MS,
  allowanceMs,
  computerTimeUsedUpMessage,
  desktopHeartbeatMs,
  idleTimeoutMs,
  isProviderCapacityError,
  SESSION_LIMIT_MS,
  runningSeconds,
  sandboxPath,
  sandboxTimeout,
} from "../lib/sandbox-policy"

test("active leases remain under Hobby's one-hour session ceiling", () => {
  const start = new Date(0)
  assert.equal(sandboxTimeout(start, 0), IDLE_TIMEOUT_MS)
  assert.equal(sandboxTimeout(start, SESSION_LIMIT_MS - 1000), 1000)
  assert.equal(sandboxTimeout(start, SESSION_LIMIT_MS + 1), 0)
  assert.equal(sandboxTimeout(start, 0, 630_000), 630_000)
  assert.ok(SESSION_LIMIT_MS < 3_600_000)
})

test("meter only whole running seconds and exclude time after pause", () => {
  assert.equal(runningSeconds(new Date(1000), new Date(12_900), 10_900), 9)
  assert.equal(runningSeconds(new Date(1000), new Date(12_900), 90_000), 11)
  assert.equal(runningSeconds(new Date(1000), new Date(0), 10_000), 0)
})

test("file and command paths share the desktop user's home directory", () => {
  assert.equal(sandboxPath("notes.md"), "/home/user/notes.md")
  assert.equal(sandboxPath("~/project/file.txt"), "/home/user/project/file.txt")
  assert.equal(sandboxPath("~"), "/home/user")
  assert.equal(sandboxPath("/tmp/file.txt"), "/tmp/file.txt")
})

test("idle time shrinks with a small allowance but never below 30 seconds", () => {
  assert.equal(idleTimeoutMs(null), IDLE_TIMEOUT_MS)
  assert.equal(idleTimeoutMs(undefined), IDLE_TIMEOUT_MS)
  assert.equal(idleTimeoutMs(Infinity), IDLE_TIMEOUT_MS)
  // Paid accounts with hours left keep five minutes
  assert.equal(idleTimeoutMs(50 * 3600), IDLE_TIMEOUT_MS)
  assert.equal(idleTimeoutMs(1200), IDLE_TIMEOUT_MS)
  // A full free allowance idles a quarter of itself, not all of it
  assert.equal(idleTimeoutMs(300), 75_000)
  assert.equal(idleTimeoutMs(120), 30_000)
  assert.equal(idleTimeoutMs(10), MIN_IDLE_TIMEOUT_MS)
  assert.equal(idleTimeoutMs(0), MIN_IDLE_TIMEOUT_MS)
  assert.equal(idleTimeoutMs(-4), MIN_IDLE_TIMEOUT_MS)
})

test("the allowance caps how long the provider may keep a computer running", () => {
  assert.equal(allowanceMs(null), Infinity)
  assert.equal(allowanceMs(300), 300_000)
  assert.equal(allowanceMs(0.5), 500)
  assert.equal(allowanceMs(-1), 0)
})

test("a viewer's heartbeat stays well inside the idle time", () => {
  for (const remaining of [null, 1, 20, 90, 300, 1200, 180_000]) {
    const beat = desktopHeartbeatMs(remaining)
    assert.ok(beat >= 10_000 && beat <= 30_000)
    assert.ok(beat * 3 <= Math.max(idleTimeoutMs(remaining), 30_000))
  }
  assert.equal(desktopHeartbeatMs(300), 25_000)
  assert.equal(desktopHeartbeatMs(null), 30_000)
})

test("used-up copy and the constants other layers rely on", () => {
  assert.equal(new Set(COMPUTER_TIME_USED_UP_ERRORS).size, 3)
  assert.match(computerTimeUsedUpMessage("free"), /Upgrade/)
  assert.doesNotMatch(computerTimeUsedUpMessage("paid"), /Upgrade/)
  assert.doesNotMatch(computerTimeUsedUpMessage(), /Upgrade/)
  assert.equal(
    COMPUTERS_BUSY_ERROR,
    "Computers are busy right now. Try again in a few minutes."
  )
  assert.equal(FREE_COMPUTER_CALLS_PER_TURN, 20)
  assert.equal(LOW_ALLOWANCE_SECONDS, 60)
  assert.deepEqual(DESKTOP_CLOSE.usageLimit, {
    code: 4429,
    reason: "usage_limit",
  })
  assert.deepEqual(DESKTOP_CLOSE.sessionEnded, {
    code: 4410,
    reason: "session_ended",
  })
  // WebSocket close reasons are limited to 123 bytes
  for (const { reason } of Object.values(DESKTOP_CLOSE))
    assert.ok(Buffer.byteLength(reason) <= 123)
})

test("provider capacity errors are recognised by name, status or message", () => {
  const named = (name: string) => Object.assign(new Error("x"), { name })
  assert.equal(isProviderCapacityError(named("RateLimitError")), true)
  assert.equal(isProviderCapacityError(named("ServiceBusyError")), true)
  assert.equal(
    isProviderCapacityError(Object.assign(new Error("x"), { statusCode: 429 })),
    true
  )
  assert.equal(
    isProviderCapacityError(
      new Error("You have reached the maximum number of concurrent sandboxes")
    ),
    true
  )
  assert.equal(isProviderCapacityError(new Error("Quota exceeded")), true)
  for (const other of [
    named("SandboxNotFoundError"),
    Object.assign(new Error("not found"), { statusCode: 404 }),
    new Error("Computer paused"),
    "rate limit",
    null,
    undefined,
  ])
    assert.equal(isProviderCapacityError(other), false)
})
