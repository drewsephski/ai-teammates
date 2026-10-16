import * as Sentry from "@sentry/node"
import { and, desc, eq, lt } from "drizzle-orm"

import { db } from "@/db"
import {
  approvalRules,
  approvals,
  bots,
  type ApprovalDecision,
} from "@/db/schema"
import {
  APPROVAL_DECIDED_ERROR,
  APPROVAL_EXPIRED_ERROR,
  APPROVAL_TTL_MS,
  approvalDecisionPrompt,
  approvalDisplayPrompt,
  approvalMessageId,
} from "@/lib/approval-policy"
import { postChatMessage } from "@/lib/chat-dispatch"
import { recordActivity } from "@/lib/notify"

export async function hasApprovalRule(botId: string, toolSlug: string) {
  const [rule] = await db
    .select({ botId: approvalRules.botId })
    .from(approvalRules)
    .where(
      and(eq(approvalRules.botId, botId), eq(approvalRules.toolSlug, toolSlug))
    )
  return !!rule
}

// Holds a connected-app call for the owner and tells their phone
export async function requestApproval(call: {
  userId: string
  botId: string
  chatId: string
  toolkit: string
  toolSlug: string
  accountId: string
  arguments: Record<string, unknown>
  summary: string
}) {
  const [row] = await db
    .insert(approvals)
    .values({ ...call, expiresAt: new Date(Date.now() + APPROVAL_TTL_MS) })
    .returning()
  const [bot] = await db
    .select({ name: bots.name })
    .from(bots)
    .where(eq(bots.id, call.botId))
  const name = bot?.name ?? "Your bot"
  await recordActivity(
    {
      userId: call.userId,
      kind: "approval_requested",
      title: `${name} needs your approval`,
      detail: call.summary,
      botId: call.botId,
      chatId: call.chatId,
      dedupeKey: `approval:${row.id}:requested`,
    },
    {
      title: `${name} needs your approval`,
      body: call.summary,
      path: `/chats/${call.chatId}`,
      category: "approval",
      data: { approvalId: row.id },
    }
  )
  return row
}

// The stored call, exactly once, for the bot that asked
export async function claimApproval(
  userId: string,
  botId: string,
  approvalId: string
) {
  const [row] = await db
    .update(approvals)
    .set({ state: "running" })
    .where(
      and(
        eq(approvals.id, approvalId),
        eq(approvals.userId, userId),
        eq(approvals.botId, botId),
        eq(approvals.state, "approved")
      )
    )
    .returning()
  return row
}

export async function completeApproval(
  approvalId: string,
  outcome: { ok: boolean; result: unknown }
) {
  await db
    .update(approvals)
    .set({ state: outcome.ok ? "executed" : "failed", result: outcome.result })
    .where(eq(approvals.id, approvalId))
}

export async function listApprovals(
  userId: string,
  options: { state?: "pending"; limit?: number } = {}
) {
  await expireApprovals(userId)
  return db.query.approvals.findMany({
    where: and(
      eq(approvals.userId, userId),
      options.state ? eq(approvals.state, options.state) : undefined
    ),
    columns: {
      arguments: true,
      id: true,
      botId: true,
      chatId: true,
      toolkit: true,
      toolSlug: true,
      summary: true,
      state: true,
      expiresAt: true,
      decidedAt: true,
      createdAt: true,
    },
    orderBy: desc(approvals.createdAt),
    limit: options.limit ?? 50,
  })
}

export async function getApproval(userId: string, approvalId: string) {
  await expireApprovals(userId)
  const row = await db.query.approvals.findFirst({
    where: and(eq(approvals.id, approvalId), eq(approvals.userId, userId)),
  })
  if (!row) throw new Error("Approval not found")
  return row
}

async function expireApprovals(userId: string) {
  await db
    .update(approvals)
    .set({ state: "expired" })
    .where(
      and(
        eq(approvals.userId, userId),
        eq(approvals.state, "pending"),
        lt(approvals.expiresAt, new Date())
      )
    )
}

// The owner's answer. Approving wakes the bot with a message naming the
// request; the bot runs the stored call through runApprovedAction.
export async function decideApproval(
  userId: string,
  approvalId: string,
  decision: ApprovalDecision
) {
  const row = await getApproval(userId, approvalId)
  if (row.state === "expired") throw new Error(APPROVAL_EXPIRED_ERROR)
  const [decided] = await db
    .update(approvals)
    .set({
      state: decision === "deny" ? "denied" : "approved",
      decidedAt: new Date(),
    })
    .where(
      and(
        eq(approvals.id, approvalId),
        eq(approvals.userId, userId),
        eq(approvals.state, "pending")
      )
    )
    .returning()
  if (!decided) {
    // A double tap from the phone and the web lands here; the first one won
    throw new Error(APPROVAL_DECIDED_ERROR)
  }
  if (decision === "always")
    await db
      .insert(approvalRules)
      .values({ userId, botId: row.botId, toolSlug: row.toolSlug })
      .onConflictDoNothing()

  await recordActivity({
    userId,
    kind: "approval_decided",
    title: decision === "deny" ? "Request declined" : "Request approved",
    detail: row.summary,
    botId: row.botId,
    chatId: row.chatId,
    dedupeKey: `approval:${row.id}:decided`,
  })

  try {
    await postChatMessage(
      row.chatId,
      {
        id: approvalMessageId(row.id, decision),
        text: approvalDecisionPrompt(row, decision),
        displayPrompt: approvalDisplayPrompt(decision),
      },
      { botId: row.botId }
    )
  } catch (error) {
    // The decision stands; the bot picks it up when the person next writes
    Sentry.captureException(error, { extra: { approvalId } })
    return { approval: decided, woke: false }
  }
  return { approval: decided, woke: true }
}
