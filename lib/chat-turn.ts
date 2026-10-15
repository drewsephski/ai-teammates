// Shared by the chat agent, the web chat and the native app's /api/v1.

// Sent to clients when the model provider is over capacity or briefly down.
// The person's message is already saved, so retrying the reply is safe.
export const MODEL_UNAVAILABLE_ERROR =
  "The AI model is busy right now. Your message is saved. Try again in a minute."

// Provider statuses that mean "busy or briefly down", not "this request is bad"
const UNAVAILABLE_STATUSES = new Set([429, 502, 503, 504, 529])

type MaybeApiError = {
  name?: unknown
  statusCode?: unknown
  isRetryable?: unknown
  responseBody?: unknown
  lastError?: unknown
  errors?: unknown
}

// AI SDK errors: APICallError carries the status, and RetryError wraps the
// last attempt's error once the SDK's own retries are spent
export function isModelUnavailable(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 3) return false
  const candidate = error as MaybeApiError
  if (
    typeof candidate.statusCode === "number" &&
    UNAVAILABLE_STATUSES.has(candidate.statusCode)
  )
    return true
  if (
    typeof candidate.responseBody === "string" &&
    /TEMPORARILY_UNAVAILABLE|over capacity|overloaded/i.test(
      candidate.responseBody
    )
  )
    return true
  if (candidate.name === "AI_RetryError")
    return (
      isModelUnavailable(candidate.lastError, depth + 1) ||
      (Array.isArray(candidate.errors) &&
        candidate.errors.some((inner) => isModelUnavailable(inner, depth + 1)))
    )
  return false
}

// What a client waiting on a reply should be told about the chat's run.
// Only "queued" and "pending_version" need explaining: the turn is accepted
// but nothing is working on it yet.
export type ChatTurnState =
  | "idle"
  | "queued"
  | "pending_version"
  | "running"
  | "ended"

export function chatTurnState(runStatus: string | undefined): ChatTurnState {
  switch (runStatus) {
    case undefined:
    case "COMPLETED":
      return "idle"
    case "PENDING_VERSION":
      return "pending_version"
    case "QUEUED":
    case "DELAYED":
    case "DEQUEUED":
      return "queued"
    case "EXECUTING":
    // A chat run waits on its session between turns; the next message wakes it
    case "WAITING":
      return "running"
    default:
      // CANCELED, FAILED, CRASHED, SYSTEM_FAILURE, EXPIRED, TIMED_OUT, ...:
      // the next message starts a fresh run
      return "ended"
  }
}
