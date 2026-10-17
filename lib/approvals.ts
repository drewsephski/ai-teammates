import * as Sentry from "@sentry/node"
import { and, count, desc, eq, gt, gte, inArray, lt, sql } from "drizzle-orm"

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
  approvalRuleApplies,
  standingRuleAllowed,
} from "@/lib/approval-policy"
import {
  EMAIL_CHANGED_ERROR,
  editEmailDraft,
  type EmailContent,
} from "@/lib/email-draft"
import { postChatMessage } from "@/lib/chat-dispatch"
import {
  APPROVAL_WINDOW_MS,
  APPROVAL_WINDOW_USES,
  COMPUTER_APPROVAL_FRESH_MS,
  computerDecisionPrompt,
  MAX_PENDING_COMPUTER_APPROVALS,
  type DeclinedAction,
} from "@/lib/computer-approval-policy"
import { recordActivity } from "@/lib/notify"

// Whether the owner's "Always allow" covers this call: the same bot, action
// and connected account, and never a high-risk action
// How long a declined app call is refused outright when asked again unchanged
export const DECLINE_MEMORY_MS = 24 * 3_600_000
export const DECLINED_REPEAT_ERROR =
  "The owner declined this exact request in the last day. Nothing was done. Don't ask again or try another way; tell them what you can do instead."

export async function hasApprovalRule(
  botId: string,
  toolSlug: string,
  accountId: string,
  tags?: readonly string[]
) {
  const [rule] = await db
    .select({
      toolSlug: approvalRules.toolSlug,
      accountId: approvalRules.accountId,
    })
    .from(approvalRules)
    .where(
      and(eq(approvalRules.botId, botId), eq(approvalRules.toolSlug, toolSlug))
    )
  return (
    !!rule && approvalRuleApplies(rule, { slug: toolSlug, accountId, tags })
  )
}

// The owner's standing rules, for review and revocation
export async function listApprovalRules(userId: string) {
  return db
    .select({
      botId: approvalRules.botId,
      botName: bots.name,
      toolSlug: approvalRules.toolSlug,
      accountId: approvalRules.accountId,
      createdAt: approvalRules.createdAt,
    })
    .from(approvalRules)
    .innerJoin(bots, eq(bots.id, approvalRules.botId))
    .where(eq(approvalRules.userId, userId))
    .orderBy(desc(approvalRules.createdAt))
}

export async function revokeApprovalRule(
  userId: string,
  botId: string,
  toolSlug: string
) {
  const [row] = await db
    .delete(approvalRules)
    .where(
      and(
        eq(approvalRules.userId, userId),
        eq(approvalRules.botId, botId),
        eq(approvalRules.toolSlug, toolSlug)
      )
    )
    .returning({ botId: approvalRules.botId })
  if (!row) throw new Error("Rule not found")
  await recordActivity({
    userId,
    kind: "approval_decided",
    title: "Always allow removed",
    detail: toolSlug,
    botId,
    dedupeKey: `approval-rule:${botId}:${toolSlug}:revoked:${Date.now()}`,
  })
}

// Holds a connected-app call, or a committing computer action, for the owner
// and tells their phone
export async function requestApproval(call: {
  userId: string
  botId: string
  chatId: string
  toolkit: string
  toolSlug: string
  accountId: string
  arguments: Record<string, unknown>
  summary: string
  kind?: "app" | "computer"
  hostname?: string
  action?: "submit" | "post" | "send" | "delete" | "buy"
  preview?: string
}) {
  if ((call.kind ?? "app") === "app") {
    // The owner already said no to exactly this: refuse without a new card
    const [declined] = await db
      .select({ id: approvals.id })
      .from(approvals)
      .where(
        and(
          eq(approvals.userId, call.userId),
          eq(approvals.botId, call.botId),
          eq(approvals.toolSlug, call.toolSlug),
          eq(approvals.accountId, call.accountId),
          eq(approvals.state, "denied"),
          gt(approvals.decidedAt, new Date(Date.now() - DECLINE_MEMORY_MS)),
          eq(approvals.arguments, call.arguments)
        )
      )
      .limit(1)
    if (declined) throw new Error(DECLINED_REPEAT_ERROR)
  } else {
    const [{ pending }] = await db
      .select({ pending: count() })
      .from(approvals)
      .where(
        and(
          eq(approvals.userId, call.userId),
          eq(approvals.chatId, call.chatId),
          eq(approvals.kind, "computer"),
          eq(approvals.state, "pending"),
          gt(approvals.expiresAt, new Date())
        )
      )
    if (pending >= MAX_PENDING_COMPUTER_APPROVALS)
      throw new Error(
        "Several computer steps are already waiting for the owner in this chat. Wait for their decision."
      )
  }
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

// The stored call, exactly once, for the bot that asked. App approvals only:
// a computer approval can't be spent on an app call, or the other way round.
export async function claimApproval(
  userId: string,
  botId: string,
  approvalId: string,
  chatId?: string
) {
  const [row] = await db
    .update(approvals)
    .set({ state: "running" })
    .where(
      and(
        eq(approvals.id, approvalId),
        eq(approvals.userId, userId),
        eq(approvals.botId, botId),
        chatId ? eq(approvals.chatId, chatId) : undefined,
        eq(approvals.kind, "app"),
        eq(approvals.state, "approved"),
        // Approved within the request's lifetime; never months later
        gt(approvals.decidedAt, new Date(Date.now() - APPROVAL_TTL_MS))
      )
    )
    .returning()
  return row
}

// A computer approval for this bot and chat, as it stands
export async function readComputerApproval(
  userId: string,
  botId: string,
  chatId: string,
  approvalId: string
) {
  const [row] = await db
    .select({
      state: approvals.state,
      action: approvals.action,
      hostname: approvals.hostname,
      claimedAt: approvals.claimedAt,
      uses: approvals.uses,
      decidedAt: approvals.decidedAt,
      arguments: approvals.arguments,
    })
    .from(approvals)
    .where(
      and(
        eq(approvals.id, approvalId),
        eq(approvals.userId, userId),
        eq(approvals.botId, botId),
        eq(approvals.chatId, chatId),
        eq(approvals.kind, "computer")
      )
    )
  if (!row) return undefined
  const { arguments: stored, ...approval } = row
  // A shell approval runs only the command the owner saw
  const command = typeof stored.command === "string" ? stored.command : null
  return { ...approval, command }
}

// Spends one gesture of a computer approval, atomically: the first spend
// claims it (approved, decided within the hour); later ones must fall inside
// its window. Returns false when nothing is left to spend.
export async function spendComputerApproval(
  userId: string,
  botId: string,
  chatId: string,
  approvalId: string,
  // Only an unspent approval: a shell command runs once
  options: { once?: boolean } = {}
) {
  const now = new Date()
  const owned = and(
    eq(approvals.id, approvalId),
    eq(approvals.userId, userId),
    eq(approvals.botId, botId),
    eq(approvals.chatId, chatId),
    eq(approvals.kind, "computer")
  )
  const [claimed] = await db
    .update(approvals)
    .set({ state: "running", claimedAt: now, uses: 1 })
    .where(
      and(
        owned,
        eq(approvals.state, "approved"),
        gt(approvals.expiresAt, now),
        gt(
          approvals.decidedAt,
          new Date(now.getTime() - COMPUTER_APPROVAL_FRESH_MS)
        )
      )
    )
    .returning({ id: approvals.id })
  if (claimed || options.once) return !!claimed
  const [again] = await db
    .update(approvals)
    .set({ uses: sql`${approvals.uses} + 1` })
    .where(
      and(
        owned,
        inArray(approvals.state, ["running", "executed"]),
        gte(approvals.claimedAt, new Date(now.getTime() - APPROVAL_WINDOW_MS)),
        lt(approvals.uses, APPROVAL_WINDOW_USES)
      )
    )
    .returning({ id: approvals.id })
  return !!again
}

// Records each spent gesture's outcome. Any success makes the approval
// executed; it is failed only when nothing it covered succeeded.
export async function completeComputerApproval(
  approvalId: string,
  outcome: { ok: boolean; result: unknown }
) {
  await db
    .update(approvals)
    .set({
      state: outcome.ok
        ? "executed"
        : sql`case when ${approvals.state} = 'executed' then 'executed'::approval_state else 'failed'::approval_state end`,
      result: sql`coalesce(${approvals.result}, '[]'::jsonb) || ${JSON.stringify([outcome])}::jsonb`,
    })
    .where(eq(approvals.id, approvalId))
}

// What the owner declined that this turn must not retry: read from the
// database by the decision message's approval ID, never from the ID alone
export async function declinedFor(
  userId: string,
  approvalId: string
): Promise<DeclinedAction[]> {
  const [row] = await db
    .select({
      kind: approvals.kind,
      toolkit: approvals.toolkit,
      action: approvals.action,
      hostname: approvals.hostname,
    })
    .from(approvals)
    .where(
      and(
        eq(approvals.id, approvalId),
        eq(approvals.userId, userId),
        eq(approvals.state, "denied")
      )
    )
  if (!row) return []
  return row.kind === "computer"
    ? [{ kind: "computer", action: row.action, hostname: row.hostname }]
    : [{ kind: "app", toolkit: row.toolkit }]
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
      kind: true,
      hostname: true,
      action: true,
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

export type ApprovalDispatch = typeof postChatMessage

// The owner's answer. Approving wakes the bot with a message naming the
// request; the bot runs the stored call through runApprovedAction.
export async function decideApproval(
  userId: string,
  approvalId: string,
  decision: ApprovalDecision,
  email?: {
    expectedArguments: Record<string, unknown>
    arguments: Record<string, unknown>
  },
  dispatch: ApprovalDispatch = postChatMessage
) {
  const row = await getApproval(userId, approvalId)
  if (row.state === "expired") throw new Error(APPROVAL_EXPIRED_ERROR)
  const [decided] = await db
    .update(approvals)
    .set({
      state: decision === "deny" ? "denied" : "approved",
      decidedAt: new Date(),
      ...(email && { arguments: email.arguments }),
    })
    .where(
      and(
        eq(approvals.id, approvalId),
        eq(approvals.userId, userId),
        eq(approvals.state, "pending"),
        gt(approvals.expiresAt, new Date()),
        ...(email ? [eq(approvals.arguments, email.expectedArguments)] : [])
      )
    )
    .returning()
  if (!decided) {
    // A double tap from the phone and the web lands here; the first one won
    throw new Error(email ? EMAIL_CHANGED_ERROR : APPROVAL_DECIDED_ERROR)
  }
  // "Always allow" saves a rule only for a low-risk app action, bound to its
  // account. On a computer or high-risk approval it is a plain approval, so
  // installed apps' Always allow button stays safe.
  const saveRule = decision === "always" && standingRuleAllowed(row)
  if (saveRule)
    await db
      .insert(approvalRules)
      .values({
        userId,
        botId: row.botId,
        toolSlug: row.toolSlug,
        accountId: row.accountId,
      })
      .onConflictDoUpdate({
        target: [approvalRules.botId, approvalRules.toolSlug],
        set: { accountId: row.accountId, createdAt: new Date() },
      })
  const effective = decision === "always" && !saveRule ? "approve" : decision

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
    await dispatch(
      row.chatId,
      {
        id: approvalMessageId(row.id, decision),
        text:
          row.kind === "computer"
            ? computerDecisionPrompt(
                row,
                effective === "deny" ? "deny" : "approve"
              )
            : approvalDecisionPrompt(row, effective),
        displayPrompt: approvalDisplayPrompt(effective),
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

// Compare the complete stored call as well as its revision: a concurrent
// save/send/notification decision must never approve unseen content.
export async function saveEmailDraft(
  userId: string,
  approvalId: string,
  revision: number,
  content: EmailContent
) {
  const row = await getApproval(userId, approvalId)
  if (row.state !== "pending") throw new Error(APPROVAL_DECIDED_ERROR)
  const next = editEmailDraft(row.arguments, revision, content)
  const [saved] = await db
    .update(approvals)
    .set({ arguments: next })
    .where(
      and(
        eq(approvals.id, approvalId),
        eq(approvals.userId, userId),
        eq(approvals.state, "pending"),
        gt(approvals.expiresAt, new Date()),
        eq(approvals.arguments, row.arguments)
      )
    )
    .returning()
  if (!saved) throw new Error(EMAIL_CHANGED_ERROR)
  return saved
}
