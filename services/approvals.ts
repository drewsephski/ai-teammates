import {
  approvalDecisionSchema,
  approvalRuleRevokeSchema,
  type ApprovalDecision,
  type ApprovalRuleRevoke,
} from "@/db/schema"
import { standingRuleAllowed } from "@/lib/approval-policy"
import {
  emailDraftActionSchema,
  editEmailDraft,
  publicEmailDraft,
  type EmailDraftAction,
} from "@/lib/email-draft"
import * as approvals from "@/lib/approvals"

// alwaysAllowed: whether "Always allow" can save a rule for this request. When
// false the option acts as a plain approval, so apps should hide it.
export async function listPendingApprovals(userId: string) {
  return (await approvals.listApprovals(userId, { state: "pending" })).map(
    (row) => ({ ...row, alwaysAllowed: standingRuleAllowed(row) })
  )
}

export type PublicApproval = Awaited<
  ReturnType<typeof listPendingApprovals>
>[number]

// The owner's "Always allow" rules, newest first
export function listApprovalRules(userId: string) {
  return approvals.listApprovalRules(userId)
}

export async function revokeApprovalRule(
  userId: string,
  input: ApprovalRuleRevoke
) {
  const { botId, toolSlug } = approvalRuleRevokeSchema.parse(input)
  await approvals.revokeApprovalRule(userId, botId, toolSlug)
  return { revoked: true as const }
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
    kind: row.kind,
    hostname: row.hostname,
    action: row.action,
    alwaysAllowed: standingRuleAllowed(row),
    // Computer approvals: the server's screenshot when the bot asked, and
    // for a shell step the exact command that will run
    preview: row.preview,
    command:
      row.kind === "computer" && typeof row.arguments.command === "string"
        ? row.arguments.command
        : null,
    arguments: row.arguments,
    summary: row.summary,
    emailDraft: publicEmailDraft(row.arguments),
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

export async function actOnEmailDraft(
  userId: string,
  approvalId: string,
  value: EmailDraftAction,
  steps?: { dispatch: approvals.ApprovalDispatch }
) {
  const input = emailDraftActionSchema.parse(value)
  const row = await approvals.getApproval(userId, approvalId)
  if (!publicEmailDraft(row.arguments)) throw new Error("Email draft not found")
  if (input.action === "save") {
    await approvals.saveEmailDraft(
      userId,
      approvalId,
      input.revision,
      input.content
    )
    return { approval: await getApproval(userId, approvalId), woke: true }
  }
  const email =
    input.action === "send"
      ? {
          expectedArguments: row.arguments,
          arguments: editEmailDraft(
            row.arguments,
            input.revision,
            input.content
          ),
        }
      : undefined
  const { woke } = await approvals.decideApproval(
    userId,
    approvalId,
    input.action === "send" ? "approve" : "deny",
    email,
    steps?.dispatch
  )
  return { approval: await getApproval(userId, approvalId), woke }
}
