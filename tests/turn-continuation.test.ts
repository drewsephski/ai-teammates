import assert from "node:assert/strict"
import test from "node:test"

import {
  parseRoutineRunMessageId,
  routineRunMessageId,
  unattendedOrigin,
} from "@/lib/routine-policy"
import {
  continuationDepth,
  continuationDispatch,
  continuationMessageId,
  MAX_FREE_TURN_CONTINUATIONS,
  MAX_TURN_CONTINUATIONS,
  rootMessageId,
  shouldContinueTurn,
} from "@/lib/turn-continuation"

const cutOff = {
  capReached: true,
  lastFinishReason: "tool-calls",
  failed: false,
  stopped: false,
  approvalRequested: false,
  spendCapReached: false,
  computerBusy: false,
  allowanceLeft: true,
  free: false,
  messageId: "msg_1",
  responsePartTypes: ["text", "tool-bash"],
}

// The message ID `depth` continuations into a chain started by `root`
function chain(root: string, depth: number) {
  let id = root
  for (let step = 0; step < depth; step++) id = continuationMessageId(id)
  return id
}

test("continuation ids count the chain and keep its root", () => {
  assert.equal(continuationDepth("msg_1"), 0)
  assert.equal(continuationDepth(undefined), 0)
  const first = continuationMessageId("msg_1")
  assert.equal(first, "continue_1_msg_1")
  assert.equal(continuationMessageId("msg_1"), first)
  assert.equal(continuationDepth(first), 1)
  assert.equal(rootMessageId(first), "msg_1")
  const second = continuationMessageId(first)
  assert.equal(second, "continue_2_msg_1")
  assert.equal(rootMessageId(second), "msg_1")
  assert.equal(rootMessageId("msg_1"), "msg_1")
  assert.equal(rootMessageId(undefined), undefined)
  assert.equal(continuationDepth("continue_x_run"), 0)
  assert.equal(rootMessageId("continue_x_run"), "continue_x_run")
})

test("a continued unattended turn stays unattended", () => {
  const routine = routineRunMessageId("abc", new Date(1_760_000_000_000))
  assert.equal(unattendedOrigin(chain(routine, 1)), "routine")
  assert.equal(unattendedOrigin(chain(routine, 3)), "routine")
  assert.equal(unattendedOrigin(chain("brief_x", 2)), "delegation")
  assert.equal(unattendedOrigin(chain("approval_x_allow", 1)), "approval")
  assert.equal(unattendedOrigin(chain("task_x", 1)), "task")
  // An attended task stays attended
  assert.equal(unattendedOrigin(chain("msg_1", 2)), undefined)
})

test("a continued routine turn reports on the run that started it", () => {
  const scheduledAt = new Date(1_760_000_000_000)
  const routine = routineRunMessageId("abc", scheduledAt)
  assert.deepEqual(parseRoutineRunMessageId(chain(routine, 2)), {
    routineId: "abc",
    scheduledAt,
  })
})

test("a turn cut off by the step or time cap mid-task continues", () => {
  assert.equal(shouldContinueTurn(cutOff), true)
})

test("a turn that finished, stopped or is waiting on someone doesn't continue", () => {
  for (const change of [
    { capReached: false },
    { lastFinishReason: "stop" },
    { failed: true },
    { stopped: true },
    { approvalRequested: true },
    { spendCapReached: true },
    { computerBusy: true },
    { allowanceLeft: false },
    { responsePartTypes: ["text", "tool-askUser"] },
    { responsePartTypes: ["tool-delegateToTeammate"] },
  ])
    assert.equal(
      shouldContinueTurn({ ...cutOff, ...change }),
      false,
      JSON.stringify(change)
    )
})

test("the chain stops after the plan's continuation limit", () => {
  const below = chain("msg_1", MAX_TURN_CONTINUATIONS - 1)
  assert.equal(shouldContinueTurn({ ...cutOff, messageId: below }), true)
  const atLimit = chain("msg_1", MAX_TURN_CONTINUATIONS)
  assert.equal(shouldContinueTurn({ ...cutOff, messageId: atLimit }), false)

  const freeBelow = chain("msg_1", MAX_FREE_TURN_CONTINUATIONS - 1)
  assert.equal(
    shouldContinueTurn({ ...cutOff, free: true, messageId: freeBelow }),
    true
  )
  const freeAtLimit = chain("msg_1", MAX_FREE_TURN_CONTINUATIONS)
  assert.equal(
    shouldContinueTurn({ ...cutOff, free: true, messageId: freeAtLimit }),
    false
  )
})

test("the continuation posts only once the turn's run has exited", () => {
  assert.equal(
    continuationDispatch({
      previousRunId: "run_a",
      currentRunId: "run_a",
      previousRunFinished: false,
    }),
    "wait"
  )
  assert.equal(
    continuationDispatch({
      previousRunId: "run_a",
      currentRunId: "run_a",
      previousRunFinished: true,
    }),
    "post"
  )
  assert.equal(
    continuationDispatch({
      previousRunId: "run_a",
      currentRunId: null,
      previousRunFinished: true,
    }),
    "post"
  )
  // The person sent a message meanwhile: theirs comes first
  assert.equal(
    continuationDispatch({
      previousRunId: "run_a",
      currentRunId: "run_b",
      previousRunFinished: true,
    }),
    "skip"
  )
})
