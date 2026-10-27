"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import { EMAIL_CHANGED_ERROR, type EmailDraftAction } from "@/lib/email-draft"
import type { ApprovalDecision, ApprovalRuleRevoke } from "@/db/schema"
import {
  APPROVAL_DECIDED_ERROR,
  APPROVAL_EXPIRED_ERROR,
} from "@/lib/approval-policy"
import * as service from "@/services/approvals"

async function signedIn() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return userId
}

export async function getApproval(approvalId: string) {
  const {
    state,
    summary,
    toolkit,
    expiresAt,
    emailDraft,
    kind,
    hostname,
    action,
    alwaysAllowed,
    preview,
    command,
    batchId,
    batchPending,
  } = await service.getApproval(await signedIn(), approvalId)
  return {
    batchId,
    batchPending,
    state,
    summary,
    toolkit,
    expiresAt,
    emailDraft,
    kind,
    hostname,
    action,
    alwaysAllowed,
    preview,
    command,
  }
}

// Every request still waiting from one reply
export async function decideApprovalBatch(
  batchId: string,
  decision: "approve" | "deny"
) {
  const result = await service.decideApprovalBatch(await signedIn(), batchId, {
    decision,
  })
  // The sidebar shows the pending count
  revalidatePath("/", "layout")
  return result
}

export async function listApprovalRules() {
  return service.listApprovalRules(await signedIn())
}

export async function revokeApprovalRule(input: ApprovalRuleRevoke) {
  const result = await service.revokeApprovalRule(await signedIn(), input)
  revalidatePath("/activity")
  return result
}

// Outcomes the card explains come back as data: production hides error text
export async function decideApproval(
  approvalId: string,
  decision: ApprovalDecision
) {
  try {
    const result = await service.decideApproval(await signedIn(), approvalId, {
      decision,
    })
    // The sidebar shows the pending count
    revalidatePath("/", "layout")
    return { ok: true as const, ...result }
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (
      message === APPROVAL_DECIDED_ERROR ||
      message === APPROVAL_EXPIRED_ERROR
    )
      return { ok: false as const, message }
    throw error
  }
}

export async function actOnEmailDraft(
  approvalId: string,
  input: EmailDraftAction
) {
  try {
    const result = await service.actOnEmailDraft(
      await signedIn(),
      approvalId,
      input
    )
    revalidatePath("/", "layout")
    return { ok: true as const, ...result }
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (
      [
        EMAIL_CHANGED_ERROR,
        APPROVAL_DECIDED_ERROR,
        APPROVAL_EXPIRED_ERROR,
      ].includes(message)
    )
      return { ok: false as const, message }
    throw error
  }
}
