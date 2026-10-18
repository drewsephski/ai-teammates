"use server"

import { auth } from "@clerk/nextjs/server"
import * as Sentry from "@sentry/nextjs"

import {
  accountDeletionSchema,
  appleDeletionOutcome,
  type AccountDeletionResult,
} from "@/lib/account-deletion-policy"
import { deleteAccount as deleteAccountData } from "@/services/account"

export async function deleteAccount(
  input: unknown
): Promise<AccountDeletionResult> {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated)
    return { ok: false, message: "Sign in again before deleting your account." }

  const parsed = accountDeletionSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, message: 'Type "delete my account" to confirm.' }

  try {
    // The same ordered cleanup as mobile, including canceling subscriptions
    // before deleting workspace data. Never accept a user ID from the browser.
    const deleted: unknown = await deleteAccountData(userId)
    return { ok: true, appleSignIn: appleDeletionOutcome(deleted) }
  } catch (cause) {
    Sentry.captureException(cause)
    return {
      ok: false,
      message:
        "Account deletion could not finish. Some data may already have been removed. Try again, or contact support if you cannot sign in.",
    }
  }
}
