import { createClerkClient } from "@clerk/backend"
import * as Sentry from "@sentry/nextjs"
import { ApiError as TriggerApiError, runs, sessions } from "@trigger.dev/sdk"
import { eq } from "drizzle-orm"

import { db } from "@/db"
import {
  withAppleAccountLock,
  type AppleAccountLock,
} from "@/lib/apple-account-lock"
import {
  accountPlans,
  activityEvents,
  appleSignInGrants,
  bots,
  chatgptConnections,
  chats,
  connectorAuthAttempts,
  forYouScans,
  memories,
  memoryEvents,
  pushDevices,
  sidebarPreferences,
  userSettings,
} from "@/db/schema"
import { cancelAccountSubscriptions } from "@/lib/account-billing"
import { deleteAccountComputer } from "@/lib/account-computer"
import { disconnectChatGPT } from "@/lib/chatgpt-connection"
import { getComposio } from "@/lib/composio"
import type { AppleRevocation } from "@/lib/apple-signin"
import { revokeAppleSignIn } from "@/services/apple"
import { deleteBot } from "@/services/bots"

type Steps = {
  withAppleLock?: AppleAccountLock
  cancelSubscriptions: (userId: string) => Promise<void>
  revokeApple: (
    userId: string,
    authorizationCode: string | undefined,
    assertHeld: () => void
  ) => Promise<AppleRevocation>
  closeChat: (chatId: string) => Promise<void>
  deleteComputer: (userId: string) => Promise<void>
  deleteBot: (userId: string, botId: string) => Promise<void>
  disconnectChatGPT: (userId: string) => Promise<unknown>
  disconnectApps: (userId: string) => Promise<void>
  deleteUser: (userId: string) => Promise<unknown>
}

// Revokes every connected app account the provider holds for this user
async function disconnectApps(userId: string) {
  if (!process.env.COMPOSIO_API_KEY) return
  const client = getComposio()
  for (;;) {
    // Deleted accounts drop out of the list, so always read the first page
    const page = await client.connectedAccounts.list({
      userIds: [userId],
      limit: 100,
    })
    if (page.items.length === 0) return
    for (const account of page.items)
      await client.connectedAccounts.delete(account.id)
  }
}

const clerk = () =>
  createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })

const providerSteps: Steps = {
  withAppleLock: withAppleAccountLock,
  cancelSubscriptions: async (userId) => {
    try {
      await cancelAccountSubscriptions(userId, clerk().billing)
    } catch (cause) {
      Sentry.captureException(cause)
      throw new Error("Couldn't cancel your subscription. Try again.")
    }
  },
  closeChat: async (chatId) => {
    let runId: string | null | undefined
    try {
      runId = (await sessions.close(chatId, { reason: "account_deleted" }))
        .currentRunId
    } catch (cause) {
      if (cause instanceof TriggerApiError && cause.status === 404) return
      Sentry.captureException(cause)
      throw new Error("Couldn't close your conversations. Try again.")
    }
    // Closing stops new messages, not a turn already running. Cancel it so it
    // can't keep working (make a teammate, use the computer) while the account
    // goes. Best effort: the bot checks in lib/account-computer.ts still hold.
    if (runId)
      await runs.cancel(runId).catch((cause: unknown) => {
        if (cause instanceof TriggerApiError && (cause.status ?? 500) < 500)
          return
        Sentry.captureException(cause)
      })
  },
  revokeApple: (userId, authorizationCode, assertHeld) =>
    revokeAppleSignIn(userId, authorizationCode, undefined, assertHeld),
  deleteComputer: deleteAccountComputer,
  deleteBot,
  disconnectChatGPT,
  disconnectApps,
  deleteUser: (userId) => clerk().users.deleteUser(userId),
}

// Deletes the account and what it owns: the computer, bots, chats, memories,
// settings and app and ChatGPT connections, then the Clerk user, which ends
// every session. Each step can run again, so a failure part-way is retried by
// asking again. Usage and sandbox metering rows are kept, keyed by the now
// unused user ID, as the billing record. Conversation history (chat_transcripts)
// cascades with the chats. What Trigger.dev still holds (session streams, run
// payloads and logs) has no supported delete; see docs/data-retention.md.
//
// Sign in with Apple is revoked before data is deleted. An Apple outage stops
// deletion for a retry; missing tokens return instructions for manual removal.
export async function deleteAccount(
  userId: string,
  steps = providerSteps,
  options: { appleAuthorizationCode?: string } = {}
): Promise<{ appleSignIn: AppleRevocation }> {
  const perform = (assertHeld: () => void = () => {}) =>
    deleteAccountLocked(userId, steps, options, assertHeld)
  // Custom provider steps can inject serialization in tests.
  return steps.withAppleLock ? steps.withAppleLock(userId, perform) : perform()
}

async function deleteAccountLocked(
  userId: string,
  steps: Steps,
  options: { appleAuthorizationCode?: string },
  assertHeld: () => void
): Promise<{ appleSignIn: AppleRevocation }> {
  // Do not leave a recurring charge attached to an account that cannot sign in.
  // A billing failure leaves the workspace intact so the person can retry.
  await steps.cancelSubscriptions(userId)

  // While the stored grant still exists. Revoking again is harmless.
  const appleSignIn = await steps.revokeApple(
    userId,
    options.appleAuthorizationCode,
    assertHeld
  )

  // Close sessions before their IDs disappear with the bots and group chats.
  // Closing prevents more messages; it does not erase Trigger.dev's records.
  const ownedChats = await db
    .select({ id: chats.id })
    .from(chats)
    .where(eq(chats.userId, userId))
  for (const chat of ownedChats) await steps.closeChat(chat.id)

  // Until none are left: a turn still running may have made a teammate since
  for (;;) {
    const owned = await db
      .select({ id: bots.id })
      .from(bots)
      .where(eq(bots.userId, userId))
    if (owned.length === 0) break
    for (const bot of owned) await steps.deleteBot(userId, bot.id)
  }

  await steps.disconnectChatGPT(userId)
  await steps.disconnectApps(userId)

  assertHeld()
  await db.transaction(async (tx) => {
    // A teammate made since the bots were deleted, by a turn still running
    await tx.delete(bots).where(eq(bots.userId, userId))
    // Group chats; direct chats went with their bots, members cascade
    await tx.delete(chats).where(eq(chats.userId, userId))
    await tx.delete(memoryEvents).where(eq(memoryEvents.userId, userId))
    await tx.delete(memories).where(eq(memories.userId, userId))
    await tx.delete(userSettings).where(eq(userSettings.userId, userId))
    await tx.delete(forYouScans).where(eq(forYouScans.userId, userId))
    await tx
      .delete(sidebarPreferences)
      .where(eq(sidebarPreferences.userId, userId))
    await tx
      .delete(connectorAuthAttempts)
      .where(eq(connectorAuthAttempts.userId, userId))
    await tx
      .delete(chatgptConnections)
      .where(eq(chatgptConnections.userId, userId))
    assertHeld()
    // Revocation finished or returned explicit manual-removal instructions.
    await tx
      .delete(appleSignInGrants)
      .where(eq(appleSignInGrants.userId, userId))
    // Routines, approvals and approval rules went with the bots and chats.
    // Usage holds stay: the settle job books them into the billing record.
    await tx.delete(activityEvents).where(eq(activityEvents.userId, userId))
    await tx.delete(pushDevices).where(eq(pushDevices.userId, userId))
    await tx.delete(accountPlans).where(eq(accountPlans.userId, userId))
    assertHeld()
  })

  // The computer last, once no bot is left: from here on nothing can create or
  // register one (lib/account-computer.ts), and one registered before is
  // removed under the account's lock. A failure here is retried by asking
  // again; the row stays until it succeeds.
  await steps.deleteComputer(userId)

  assertHeld()
  await steps.deleteUser(userId)
  return { appleSignIn }
}
