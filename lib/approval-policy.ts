// Which connected-app actions wait for the owner. Pure; tested in
// tests/approval-policy.test.ts.

export const APPROVAL_TTL_MS = 7 * 24 * 3_600_000
export const APPROVAL_DECIDED_ERROR = "This request was already decided."
export const APPROVAL_EXPIRED_ERROR = "This request expired. Ask the bot again."

const READ = new Set([
  "GET",
  "LIST",
  "FETCH",
  "SEARCH",
  "FIND",
  "READ",
  "RETRIEVE",
  "QUERY",
  "DESCRIBE",
  "COUNT",
  "CHECK",
  "LOOKUP",
  "VIEW",
  "DOWNLOAD",
  "EXPORT",
  "PREVIEW",
  "INFO",
  "WHOAMI",
])

const WRITE = new Set([
  "SEND",
  "CREATE",
  "DELETE",
  "REMOVE",
  "UPDATE",
  "EDIT",
  "PATCH",
  "POST",
  "PUT",
  "REPLY",
  "FORWARD",
  "MOVE",
  "ARCHIVE",
  "TRASH",
  "ADD",
  "INVITE",
  "SHARE",
  "MERGE",
  "CLOSE",
  "REOPEN",
  "PUBLISH",
  "UPLOAD",
  "SET",
  "INSERT",
  "APPEND",
  "CANCEL",
  "ACCEPT",
  "DECLINE",
  "MARK",
  "STAR",
  "LABEL",
  "ASSIGN",
  "TRANSFER",
  "PAY",
  "CHARGE",
  "REFUND",
  "SUBSCRIBE",
  "UNSUBSCRIBE",
  "BLOCK",
  "BAN",
  "KICK",
  "RUN",
  "EXECUTE",
  "TRIGGER",
  "DISPATCH",
  "COMMENT",
  "REACT",
  "PIN",
  "SCHEDULE",
  "BOOK",
  "ORDER",
  "PURCHASE",
  "BUY",
  "RENAME",
  "REPLACE",
  "CLEAR",
  "EMPTY",
  "RESET",
  "REVOKE",
  "APPROVE",
  "REJECT",
  "DRAFT",
])

function verb(word: string) {
  if (READ.has(word) || WRITE.has(word)) return word
  // SENDS, LISTS, GETS
  const singular = word.endsWith("S") ? word.slice(0, -1) : word
  return READ.has(singular) || WRITE.has(singular) ? singular : undefined
}

// Composio's tool tags are authoritative when present. Otherwise the first
// verb in the slug after the toolkit decides; anything unrecognised waits for
// approval, so an unknown action is never taken silently.
export function appToolRisk(slug: string, tags?: readonly string[]) {
  if (tags?.includes("destructiveHint")) return "write" as const
  if (tags?.includes("readOnlyHint")) return "read" as const
  for (const word of slug.toUpperCase().split("_").slice(1)) {
    const match = verb(word)
    if (match) return READ.has(match) ? ("read" as const) : ("write" as const)
  }
  return "write" as const
}

// What the approval card says when the bot gave no summary
export function fallbackSummary(slug: string, input: Record<string, unknown>) {
  const name = slug
    .split("_")
    .slice(1)
    .join(" ")
    .toLowerCase()
    .replace(/^\w/, (letter) => letter.toUpperCase())
  const detail = JSON.stringify(input)
  return `${name || slug}: ${detail.length > 160 ? `${detail.slice(0, 157)}…` : detail}`
}

export function approvalMessageId(approvalId: string, decision: string) {
  return `approval_${approvalId}_${decision}`
}

export function approvalDecisionPrompt(
  approval: { id: string; summary: string },
  decision: "approve" | "always" | "deny"
) {
  if (decision === "deny")
    return `The owner declined this request: "${approval.summary}". Don't take that action or work around it. Acknowledge briefly and say what you'll do instead, if anything.`
  return `The owner approved this request: "${approval.summary}". Call runApprovedAction with approvalId "${approval.id}" now, check the result, then finish the task and report back.${decision === "always" ? " They also chose to always allow this action for you, so it won't need approval next time." : ""}`
}

export function approvalDisplayPrompt(decision: "approve" | "always" | "deny") {
  return decision === "deny"
    ? "Declined"
    : decision === "always"
      ? "Approved, always allow"
      : "Approved"
}
