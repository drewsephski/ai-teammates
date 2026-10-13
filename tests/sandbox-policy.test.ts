import assert from "node:assert/strict"
import test from "node:test"

import {
  IDLE_TIMEOUT_MS,
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
  assert.equal(sandboxPath("MEMORY.md"), "/home/user/MEMORY.md")
  assert.equal(sandboxPath("~/project/file.txt"), "/home/user/project/file.txt")
  assert.equal(sandboxPath("~"), "/home/user")
  assert.equal(sandboxPath("/tmp/file.txt"), "/tmp/file.txt")
})
