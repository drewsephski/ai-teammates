import assert from "node:assert/strict"
import test from "node:test"

import {
  continuationDepth,
  continuationMessageId,
  MAX_TURN_CONTINUATIONS,
  shouldContinueTurn,
} from "@/lib/turn-continuation"

const cutOff = {
  stepLimitReached: true,
  lastFinishReason: "tool-calls",
  failed: false,
  approvalRequested: false,
  allowanceLeft: true,
  messageId: "msg_1",
  responsePartTypes: ["text", "tool-bash"],
}

test("continuation ids count the chain and are stable per turn", () => {
  assert.equal(continuationDepth("msg_1"), 0)
  assert.equal(continuationDepth(undefined), 0)
  const first = continuationMessageId("msg_1", "run_a", 2)
  assert.equal(first, "continue_1_run_a_2")
  assert.equal(continuationMessageId("msg_1", "run_a", 2), first)
  assert.equal(continuationDepth(first), 1)
  assert.equal(continuationDepth(continuationMessageId(first, "run_b", 0)), 2)
  assert.equal(continuationDepth("continue_x_run"), 0)
})

test("a turn cut off by the step cap mid-task continues", () => {
  assert.equal(shouldContinueTurn(cutOff), true)
})

test("a turn that finished, failed or is waiting on someone doesn't continue", () => {
  assert.equal(
    shouldContinueTurn({ ...cutOff, stepLimitReached: false }),
    false
  )
  assert.equal(
    shouldContinueTurn({ ...cutOff, lastFinishReason: "stop" }),
    false
  )
  assert.equal(shouldContinueTurn({ ...cutOff, failed: true }), false)
  assert.equal(
    shouldContinueTurn({ ...cutOff, approvalRequested: true }),
    false
  )
  assert.equal(shouldContinueTurn({ ...cutOff, allowanceLeft: false }), false)
  assert.equal(
    shouldContinueTurn({
      ...cutOff,
      responsePartTypes: ["text", "tool-askUser"],
    }),
    false
  )
})

test("the chain stops after the continuation limit", () => {
  const atLimit = `continue_${MAX_TURN_CONTINUATIONS}_run_a_0`
  assert.equal(shouldContinueTurn({ ...cutOff, messageId: atLimit }), false)
  const below = `continue_${MAX_TURN_CONTINUATIONS - 1}_run_a_0`
  assert.equal(shouldContinueTurn({ ...cutOff, messageId: below }), true)
})
