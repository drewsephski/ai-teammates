// Reads a connected-app failure. A provider error is never taken for success
// and is never retried blindly: auth problems need the person to reconnect,
// and anything that may have reached the provider needs a read first.

export type ConnectorFailure =
  | "connection_expired"
  | "insufficient_permissions"
  | "unknown_outcome"
  | "other"

const EXPIRED_TEXT =
  /\b(?:invalid[_ ]grant|invalid[_ ]token|token (?:has |is )?(?:expired|revoked|invalid)|(?:expired|revoked|invalid|inactive) (?:access |refresh |auth(?:orization)? )?(?:token|credentials?|connection)|(?:connected )?account (?:is |has )?(?:expired|revoked|inactive|disabled)|connection (?:is |has )?(?:expired|revoked|inactive)|re-?authenticat|re-?authori[sz]|refresh token|authentication (?:failed|required|expired)|unauthori[sz]ed|status(?:[_ ]code)?[:= ]*401)\b/i
const INSUFFICIENT_TEXT =
  /\b(?:insufficient[_ ](?:permissions?|scopes?|authentication scopes?)|missing (?:required )?scopes?|(?:scopes?|permissions?) (?:are |is )?(?:required|missing|insufficient))\b/i
const TRANSIENT_TEXT =
  /\b(?:time(?:d)? ?out|etimedout|econnreset|econnrefused|socket hang up|fetch failed|bad gateway|service unavailable|gateway time-?out|internal server error|temporarily unavailable|status(?:[_ ]code)?[:= ]*5\d\d)\b/i

function numberField(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object") return undefined
  for (const key of keys) {
    const found = (value as Record<string, unknown>)[key]
    if (typeof found === "number") return found
  }
  return undefined
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value
  if (value instanceof Error) return `${value.name} ${value.message}`
  if (value && typeof value === "object") {
    const message = (value as Record<string, unknown>).message
    return typeof message === "string" ? message : ""
  }
  return ""
}

function classify(text: string, status: number | undefined): ConnectorFailure {
  if (status === 401 || EXPIRED_TEXT.test(text)) return "connection_expired"
  if (INSUFFICIENT_TEXT.test(text)) return "insufficient_permissions"
  if (status !== undefined && status >= 500) return "unknown_outcome"
  if (TRANSIENT_TEXT.test(text)) return "unknown_outcome"
  return "other"
}

// A thrown SDK or transport error
export function classifyThrown(error: unknown): ConnectorFailure {
  if (
    error instanceof Error &&
    error.name === "ComposioConnectedAccountNotFoundError"
  )
    return "connection_expired"
  const status =
    numberField(error, ["status", "statusCode"]) ??
    numberField((error as { cause?: unknown } | null)?.cause, [
      "status",
      "statusCode",
    ])
  return classify(textOf(error), status)
}

// A failed execution envelope: { error, data: { status_code, message } }
export function classifyEnvelope(envelope: Record<string, unknown>) {
  const data = envelope.data
  const status =
    numberField(data, ["status_code", "statusCode", "http_status"]) ??
    numberField(envelope, ["status_code", "statusCode"])
  const text = [textOf(envelope.error), textOf(data)].join(" ")
  return classify(text, status)
}

export const CONNECTION_EXPIRED_MESSAGE =
  "The connection to this app expired or was revoked, so nothing ran. Don't retry and don't work around it with the computer or another tool. Call askUser with appConnection { toolkit, name } so the person can reconnect it from a card, then stop. When they reconnect you'll get a message: rediscover the tools and continue."
export const INSUFFICIENT_PERMISSIONS_MESSAGE =
  "The connected account is missing a permission this action needs, so it didn't run. Tell the person which action needs more access and offer to reconnect the app (askUser with appConnection { toolkit, name }) so they can grant it. Don't retry the same call."
export const UNKNOWN_OUTCOME_MESSAGE =
  "The provider had a server error or timed out, so the action may or may not have happened. Verify the external state with a read tool before doing anything else. Never repeat a write until you have checked it didn't happen. If you can't verify, report it as unconfirmed."
