import assert from "node:assert/strict"
import test from "node:test"

import {
  eraseChatSession,
  sweepOrphanSessions,
  type ErasureSteps,
} from "../lib/trigger-session-erasure"

// What Trigger.dev holds for a deleted chat's session is erased in an order
// that works: `.out` can be trimmed only while the session is open, so the run
// stops and the trim happens before the close.

function steps(
  state: Awaited<ReturnType<ErasureSteps["retrieve"]>>,
  overrides: Partial<ErasureSteps> = {}
) {
  const calls: string[] = []
  const record =
    (name: string) =>
    async (...args: string[]) =>
      void calls.push([name, ...args].join(":"))
  const fake: ErasureSteps = {
    retrieve: async () => state,
    stopRun: record("stop"),
    trimOutput: record("trim"),
    clearSnapshot: record("snapshot"),
    markErased: record("mark"),
    close: record("close"),
    verify: record("verify"),
    ...overrides,
  }
  return { calls, fake }
}

test("an open session: stop the run, trim, clear, mark, close, then verify", async () => {
  const { calls, fake } = steps({ open: true, runId: "run_1", erased: false })
  assert.equal(await eraseChatSession("chat_1", "chat_deleted", fake), "erased")
  assert.deepEqual(calls, [
    "stop:run_1",
    "trim:chat_1",
    "snapshot:chat_1",
    "mark:chat_1",
    "close:chat_1:chat_deleted",
    "verify:chat_1",
  ])
})

test("an idle open session has no run to stop", async () => {
  const { calls, fake } = steps({ open: true, runId: null, erased: false })
  await eraseChatSession("chat_1", "account_deleted", fake)
  assert.equal(calls[0], "trim:chat_1")
})

test("a closed or expired session can't be trimmed; the rest still runs", async () => {
  const { calls, fake } = steps({ open: false, runId: "run_1", erased: false })
  assert.equal(await eraseChatSession("chat_1", "chat_deleted", fake), "erased")
  assert.deepEqual(calls, ["snapshot:chat_1", "mark:chat_1", "verify:chat_1"])
})

test("no session, or one already erased and closed, needs nothing", async () => {
  assert.equal(
    await eraseChatSession("chat_1", "chat_deleted", steps(undefined).fake),
    "absent"
  )
  const erased = steps({ open: false, erased: true })
  assert.equal(
    await eraseChatSession("chat_1", "chat_deleted", erased.fake),
    "already erased"
  )
  assert.deepEqual(erased.calls, [])
})

test("an erasure that stopped before closing is finished next time", async () => {
  const { calls, fake } = steps({ open: true, runId: null, erased: true })
  await eraseChatSession("chat_1", "chat_deleted", fake)
  assert.ok(calls.includes("close:chat_1:chat_deleted"))
})

test("a failed trim stops the erasure before the session is closed", async () => {
  const { calls, fake } = steps(
    { open: true, runId: null, erased: false },
    {
      trimOutput: async () => {
        throw new Error("S2 unavailable")
      },
    }
  )
  await assert.rejects(
    eraseChatSession("chat_1", "chat_deleted", fake),
    /S2 unavailable/
  )
  // Still open, so a retry can trim
  assert.deepEqual(calls, [])
})

test("a transcript Trigger.dev still serves fails the erasure", async () => {
  const { fake } = steps(
    { open: false, erased: false },
    {
      verify: async () => {
        throw new Error("Trigger.dev still serves this chat's transcript")
      },
    }
  )
  await assert.rejects(
    eraseChatSession("chat_1", "chat_deleted", fake),
    /still serves/
  )
})

const HOUR = 60 * 60 * 1000
const now = Date.parse("2026-10-19T04:23:00Z")

async function* list(
  sessions: { externalId: string | null; ageMs: number; erased?: boolean }[]
) {
  for (const session of sessions)
    yield {
      externalId: session.externalId,
      createdAt: new Date(now - session.ageMs),
      erased: session.erased ?? false,
    }
}

test("the sweep erases sessions whose chat is gone, and only those", async () => {
  const erased: string[] = []
  const result = await sweepOrphanSessions(
    {
      list: () =>
        list([
          { externalId: "chat_live", ageMs: 5 * HOUR },
          { externalId: "chat_gone", ageMs: 5 * HOUR },
          { externalId: "chat_done", ageMs: 5 * HOUR, erased: true },
          { externalId: "chat_new", ageMs: HOUR / 2 },
          { externalId: null, ageMs: 5 * HOUR },
        ]),
      existingChats: async (ids) =>
        new Set(ids.filter((id) => id === "chat_live")),
      erase: async (chatId) => void erased.push(chatId),
    },
    { now }
  )
  assert.deepEqual(erased, ["chat_gone"])
  assert.deepEqual(result, { erased: 1, failed: 0 })
})

test("the sweep counts failures, keeps going, and stops at its limit", async () => {
  const attempted: string[] = []
  const result = await sweepOrphanSessions(
    {
      list: () =>
        list(
          Array.from({ length: 250 }, (_, i) => ({
            externalId: `chat_${i}`,
            ageMs: 2 * HOUR,
          }))
        ),
      existingChats: async () => new Set(),
      erase: async (chatId) => {
        attempted.push(chatId)
        if (chatId === "chat_0") throw new Error("Trigger.dev unavailable")
      },
    },
    { now, limit: 120 }
  )
  assert.equal(attempted.length, 120)
  assert.deepEqual(result, { erased: 119, failed: 1 })
})
