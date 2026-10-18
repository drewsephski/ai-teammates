import { createClerkClient } from "@clerk/backend"
// @sentry/node, like lib/: the same client in Next, and it runs under tsx tests
import * as Sentry from "@sentry/node"
import { eq, sql } from "drizzle-orm"

import { db } from "@/db"
import { appleSignInGrants } from "@/db/schema"
import {
  AppleRequestError,
  appleSignInConfig,
  appleSubjectsOf,
  decryptAppleRefreshToken,
  encryptAppleRefreshToken,
  exchangeAppleCode,
  revokeAppleToken,
  type AppleConfigResult,
  type AppleRevocation,
} from "@/lib/apple-signin"

export const APPLE_SAVE_ERROR =
  "Couldn't save your Sign in with Apple. Try again."
export const APPLE_REVOKE_ERROR =
  "Couldn't revoke Sign in with Apple. Try again."
export const APPLE_ACCOUNT_ERROR = "Apple account not found"

export type AppleDeps = {
  config: () => AppleConfigResult
  // The Apple user IDs Clerk has linked to this account
  appleSubjects: (userId: string) => Promise<string[]>
  fetcher: typeof fetch
}

async function clerkAppleSubjects(userId: string) {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
  try {
    const user = await clerk.users.getUser(userId)
    return appleSubjectsOf(user.externalAccounts)
  } catch (cause) {
    // A user already removed from Clerk has nothing linked
    if ((cause as { status?: number })?.status === 404) return []
    throw cause
  }
}

export const appleDeps: AppleDeps = {
  config: () => appleSignInConfig(),
  appleSubjects: clerkAppleSubjects,
  fetcher: (...args) => fetch(...args),
}

const tags = { area: "apple-signin" }

// Stores the refresh token for an authorization code the native app just got
// from Apple. The code is single-use and short-lived, so the app posts it right
// after signing in. It is never logged. The Apple ID behind the code must be
// one Clerk has linked to this account, so nobody can file another person's
// grant under their own account.
export async function saveAppleAuthorization(
  userId: string,
  authorizationCode: string,
  deps = appleDeps
) {
  const configured = deps.config()
  if (!configured.ok) {
    Sentry.captureMessage("Sign in with Apple is not configured", {
      level: "error",
      tags: { ...tags, outcome: "not_configured" },
      extra: { problem: configured.problem },
    })
    throw new Error(APPLE_SAVE_ERROR)
  }
  const { config } = configured

  let grant: { refreshToken: string; subject: string }
  try {
    grant = await exchangeAppleCode(config, authorizationCode, deps.fetcher)
  } catch (cause) {
    Sentry.captureException(cause, { tags: { ...tags, step: "exchange" } })
    throw new Error(APPLE_SAVE_ERROR)
  }

  let subjects: string[]
  try {
    subjects = await deps.appleSubjects(userId)
  } catch (cause) {
    Sentry.captureException(cause, { tags: { ...tags, step: "subjects" } })
    throw new Error(APPLE_SAVE_ERROR)
  }
  if (!subjects.includes(grant.subject)) throw new Error(APPLE_ACCOUNT_ERROR)

  const refreshToken = encryptAppleRefreshToken(
    grant.refreshToken,
    userId,
    config.clientId,
    config.encryptionKey
  )
  await db
    .insert(appleSignInGrants)
    .values({
      userId,
      clientId: config.clientId,
      subject: grant.subject,
      refreshToken,
    })
    .onConflictDoUpdate({
      target: [appleSignInGrants.userId, appleSignInGrants.clientId],
      set: { subject: grant.subject, refreshToken, updatedAt: sql`now()` },
    })
}

type Token = { clientId: string; subject: string; refreshToken: string }

// Revokes every Sign in with Apple grant this account has, so Krafty leaves
// the person's Apple Account settings. Runs during account deletion, before
// any data is removed.
//
// Tokens come from grants stored at sign-in and, when the app re-authenticated
// with Apple during deletion, from that fresh authorization code.
//
// An Apple outage throws, so deletion stops and asking again retries (Apple
// answers 200 for a token already revoked). A missing key, a bad key or an
// Apple account with no token can't be fixed by retrying: deletion goes on and
// the result is "manual", which the app turns into instructions for removing
// Krafty in Settings. Those cases are reported to Sentry for follow-up.
export async function revokeAppleSignIn(
  userId: string,
  authorizationCode: string | undefined,
  deps = appleDeps
): Promise<AppleRevocation> {
  const grants = await db
    .select()
    .from(appleSignInGrants)
    .where(eq(appleSignInGrants.userId, userId))

  let subjects: string[]
  try {
    subjects = await deps.appleSubjects(userId)
  } catch (cause) {
    Sentry.captureException(cause, { tags: { ...tags, step: "subjects" } })
    throw new Error(APPLE_REVOKE_ERROR)
  }
  if (!grants.length && !subjects.length && !authorizationCode) return "none"

  const manual = (reason: string, level: "warning" | "error") => {
    Sentry.captureMessage("Sign in with Apple needs manual removal", {
      level,
      tags: { ...tags, outcome: "manual", reason },
      user: { id: userId },
    })
    return "manual" as const
  }

  const configured = deps.config()
  if (!configured.ok) {
    Sentry.captureMessage("Sign in with Apple is not configured", {
      level: "error",
      tags: { ...tags, outcome: "not_configured" },
      extra: { problem: configured.problem },
    })
    return manual("not_configured", "error")
  }
  const { config } = configured

  const tokens: Token[] = []
  let unreadable = false
  for (const grant of grants) {
    try {
      tokens.push({
        clientId: grant.clientId,
        subject: grant.subject,
        refreshToken: decryptAppleRefreshToken(
          grant.refreshToken,
          userId,
          grant.clientId,
          config.encryptionKey
        ),
      })
    } catch (cause) {
      // A rotated encryption key: this token is lost
      unreadable = true
      Sentry.captureException(cause, { tags: { ...tags, step: "decrypt" } })
    }
  }

  if (authorizationCode) {
    try {
      const fresh = await exchangeAppleCode(
        config,
        authorizationCode,
        deps.fetcher
      )
      // Only revoke an Apple ID that belongs to this account
      const owned =
        subjects.includes(fresh.subject) ||
        grants.some((grant) => grant.subject === fresh.subject)
      if (owned) {
        // The code is single-use. Keep the token before revoking so an outage
        // or a later deletion failure can retry without another Apple sheet.
        const refreshToken = encryptAppleRefreshToken(
          fresh.refreshToken,
          userId,
          config.clientId,
          config.encryptionKey
        )
        await db
          .insert(appleSignInGrants)
          .values({
            userId,
            clientId: config.clientId,
            subject: fresh.subject,
            refreshToken,
          })
          .onConflictDoUpdate({
            target: [appleSignInGrants.userId, appleSignInGrants.clientId],
            set: {
              subject: fresh.subject,
              refreshToken,
              updatedAt: sql`now()`,
            },
          })
        tokens.push({ clientId: config.clientId, ...fresh })
      } else
        Sentry.captureMessage("Apple code belongs to another Apple ID", {
          level: "warning",
          tags: { ...tags, step: "exchange" },
        })
    } catch (cause) {
      if (!(cause instanceof AppleRequestError) || cause.retryable) {
        Sentry.captureException(cause, { tags: { ...tags, step: "exchange" } })
        throw new Error(APPLE_REVOKE_ERROR)
      }
      // A used or expired code: fall back to stored grants and Settings
      Sentry.captureException(cause, {
        level: "warning",
        tags: { ...tags, step: "exchange" },
      })
    }
  }

  const revoked = new Set<string>()
  let failed = false
  for (const token of tokens) {
    try {
      await revokeAppleToken(
        config,
        token.clientId,
        token.refreshToken,
        deps.fetcher
      )
      revoked.add(token.subject)
    } catch (cause) {
      Sentry.captureException(cause, { tags: { ...tags, step: "revoke" } })
      if (cause instanceof AppleRequestError && cause.retryable)
        throw new Error(APPLE_REVOKE_ERROR)
      failed = true
    }
  }

  if (failed) return manual("revoke_rejected", "error")
  if (unreadable) return manual("token_unreadable", "error")
  if (!revoked.size) return manual("no_token", "warning")
  if (subjects.some((subject) => !revoked.has(subject)))
    return manual("subject_without_token", "warning")
  return "revoked"
}
