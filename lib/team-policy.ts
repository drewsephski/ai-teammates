import { createHash } from "node:crypto"

export const MAX_DELEGATION_DEPTH = 3
export { MAX_TEAMMATES } from "./billing-policy"

// Stable across tool retries and worker restarts, scoped to one user's turn.
export function teamOperationId(
  userId: string,
  chatId: string,
  messageId: string
) {
  return createHash("sha256")
    .update(JSON.stringify([userId, chatId, messageId]))
    .digest("hex")
    .slice(0, 32)
}

export function assertDelegationDepth(depth: number) {
  if (!Number.isInteger(depth) || depth < 0 || depth >= MAX_DELEGATION_DEPTH) {
    throw new Error(
      "This task has reached its delegation limit. Finish it in this chat."
    )
  }
}
