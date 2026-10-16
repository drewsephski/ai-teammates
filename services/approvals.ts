import { approvalDecisionSchema, type ApprovalDecision } from "@/db/schema"
import * as approvals from "@/lib/approvals"

export type PublicApproval = Awaited<
  ReturnType<typeof approvals.listApprovals>
>[number]

export function listPendingApprovals(userId: string) {
  return approvals.listApprovals(userId, { state: "pending" })
}

// Never the owner's ID or the provider's raw result
export async function getApproval(userId: string, approvalId: string) {
  const row = await approvals.getApproval(userId, approvalId)
  return {
    id: row.id,
    botId: row.botId,
    chatId: row.chatId,
    toolkit: row.toolkit,
    toolSlug: row.toolSlug,
    arguments: row.arguments,
    summary: row.summary,
    state: row.state,
    expiresAt: row.expiresAt,
    decidedAt: row.decidedAt,
    createdAt: row.createdAt,
  }
}

// Approving or declining wakes the bot in the chat that asked. `woke` is false
// when the decision was saved but the bot couldn't be reached.
export async function decideApproval(
  userId: string,
  approvalId: string,
  input: { decision: ApprovalDecision }
) {
  const { decision } = approvalDecisionSchema.parse(input)
  const { approval, woke } = await approvals.decideApproval(
    userId,
    approvalId,
    decision
  )
  return { state: approval.state, chatId: approval.chatId, woke }
}
