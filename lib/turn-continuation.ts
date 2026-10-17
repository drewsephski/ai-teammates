// A turn that reaches its step cap while the bot is still working is carried
// on by a server-sent "continue" message, so long tasks don't stop midway.
// The AI allowance still bounds the work: the stop condition on spend ends a
// turn, and the next turn refuses to start once the allowance is gone.

// Steps one turn may take before it hands over to a continuation turn
export const TURN_STEP_LIMIT = 150

// Continuation turns one task may chain before the bot stops and reports
export const MAX_TURN_CONTINUATIONS = 10

const CONTINUE_PREFIX = "continue_"

// How many continuations led to the turn started by this message
export function continuationDepth(messageId: string | undefined) {
  if (!messageId?.startsWith(CONTINUE_PREFIX)) return 0
  const depth = Number(messageId.slice(CONTINUE_PREFIX.length).split("_")[0])
  return Number.isInteger(depth) && depth > 0 ? depth : 0
}

// Deterministic per turn, so a retried dispatch never posts twice
export function continuationMessageId(
  previousMessageId: string | undefined,
  runId: string,
  turn: number
) {
  return `${CONTINUE_PREFIX}${continuationDepth(previousMessageId) + 1}_${runId}_${turn}`
}

// Tool parts that end a turn on purpose: the bot is waiting on someone
const PAUSING_PARTS = new Set([
  "tool-askUser",
  "tool-createTeammate",
  "tool-createGroupChat",
  "tool-delegateToTeammate",
])

export function shouldContinueTurn(turn: {
  stepLimitReached: boolean
  // Why the last step ended; "tool-calls" means the bot wanted another step
  lastFinishReason?: string
  failed: boolean
  approvalRequested: boolean
  allowanceLeft: boolean
  messageId: string | undefined
  responsePartTypes: readonly string[]
}) {
  return (
    turn.stepLimitReached &&
    turn.lastFinishReason === "tool-calls" &&
    !turn.failed &&
    !turn.approvalRequested &&
    turn.allowanceLeft &&
    continuationDepth(turn.messageId) < MAX_TURN_CONTINUATIONS &&
    !turn.responsePartTypes.some((type) => PAUSING_PARTS.has(type))
  )
}

export const CONTINUATION_DISPLAY_PROMPT = "Continuing"

export const CONTINUATION_PROMPT =
  "You reached the step limit for one turn before finishing. Continue the task from where you stopped; don't repeat finished work or restart it. When it's done, give your usual short report."
