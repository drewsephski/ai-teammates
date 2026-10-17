// A turn that reaches its step or time cap while the bot is still working is
// carried on by a server-sent "continue" message, so long tasks don't stop
// midway. The AI allowance still bounds the work: the stop condition on spend
// ends a turn, and the next turn refuses to start once the allowance is gone.
//
// A continuation's message ID carries the ID of the message that started the
// task (its root), so the chain keeps that message's standing: a continued
// routine is still unattended, a continued decline still knows what was
// declined, and a continued brief keeps its delegation depth.

// Steps one turn may take before it hands over to a continuation turn
export const TURN_STEP_LIMIT = 150

// Wall-clock time one turn may take before it hands over, well inside the
// task's one-hour maxDuration so a slow desktop task isn't killed midway
export const TURN_TIME_LIMIT_MS = 40 * 60_000

// Continuation turns one task may chain before the bot stops and reports
export const MAX_TURN_CONTINUATIONS = 10
export const MAX_FREE_TURN_CONTINUATIONS = 2

// How long after a turn ends its continuation is posted. The chat's run must
// have exited by then: a message that arrives while a run is still alive
// doesn't boot the next one.
export const CONTINUATION_DELAY = "3s"

const CONTINUATION_ID = /^continue_(\d+)_(.+)$/

// How many continuations led to the turn started by this message
export function continuationDepth(messageId: string | undefined) {
  const depth = Number(CONTINUATION_ID.exec(messageId ?? "")?.[1])
  return Number.isInteger(depth) && depth > 0 ? depth : 0
}

// The message that started the task this turn belongs to
export function rootMessageId(messageId: string): string
export function rootMessageId(messageId: string | undefined): string | undefined
export function rootMessageId(messageId: string | undefined) {
  if (continuationDepth(messageId) === 0) return messageId
  return CONTINUATION_ID.exec(messageId!)![2]
}

// Deterministic per step of the chain, so a retried dispatch never posts twice
export function continuationMessageId(previousMessageId: string) {
  return `continue_${continuationDepth(previousMessageId) + 1}_${rootMessageId(previousMessageId)}`
}

// Tool parts that end a turn on purpose: the bot is waiting on someone
const PAUSING_PARTS = new Set([
  "tool-askUser",
  "tool-createTeammate",
  "tool-createGroupChat",
  "tool-delegateToTeammate",
])

export function shouldContinueTurn(turn: {
  // The turn ended at TURN_STEP_LIMIT or TURN_TIME_LIMIT_MS
  capReached: boolean
  // Why the last step ended; "tool-calls" means the bot wanted another step
  lastFinishReason?: string
  failed: boolean
  // The person pressed Stop
  stopped: boolean
  approvalRequested: boolean
  // The turn ended because it spent what was left
  spendCapReached: boolean
  // Another bot held the computer, so carrying on would only wait again
  computerBusy: boolean
  allowanceLeft: boolean
  free: boolean
  messageId: string
  responsePartTypes: readonly string[]
}) {
  const limit = turn.free ? MAX_FREE_TURN_CONTINUATIONS : MAX_TURN_CONTINUATIONS
  return (
    turn.capReached &&
    turn.lastFinishReason === "tool-calls" &&
    !turn.failed &&
    !turn.stopped &&
    !turn.approvalRequested &&
    !turn.spendCapReached &&
    !turn.computerBusy &&
    turn.allowanceLeft &&
    continuationDepth(turn.messageId) < limit &&
    !turn.responsePartTypes.some((type) => PAUSING_PARTS.has(type))
  )
}

// What the dispatch task does once the turn is over: post the continuation,
// wait for the turn's run to exit, or drop it because the chat moved on (the
// person sent a message, which comes first)
export function continuationDispatch(state: {
  previousRunId: string
  currentRunId: string | null | undefined
  previousRunFinished: boolean
}) {
  if (state.currentRunId && state.currentRunId !== state.previousRunId)
    return "skip" as const
  return state.previousRunFinished ? ("post" as const) : ("wait" as const)
}

export const CONTINUATION_DISPLAY_PROMPT = "Continuing"

export const CONTINUATION_PROMPT =
  "You reached the step or time limit for one turn before finishing. Continue the task from where you stopped; don't repeat finished work or restart it. When it's done, give your usual short report."
