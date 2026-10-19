import { createClerkClient } from "@clerk/backend"
// Shares the Next server client and also supports service tests under tsx.
import * as Sentry from "@sentry/node"
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
import { eraseChatSession } from "@/lib/trigger-session-erasure"
import type { AppleRevocation } from "@/lib/apple-signin"
import {
  appleAuthorizationCodeSchema,
  revokeAppleSignIn,
} from "@/services/apple"
import { deleteBot } from "@/services/bots"

type Steps = {
  deleteAppleGrants?: (userId: string, assertHeld: () => void) => Promise<void>
  withAppleLock?: AppleAccountLock
  cancelSubscriptions: (userId: string) => Promise<void>
  revokeApple: (
    userId: string,
    authorizationCode: string | undefined,
    assertHeld: () => void
  ) => Promise<AppleRevocation>
  eraseChat: (chatId: string) => Promise<unknown>
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
  // Stops the chat's running turn, so it can't keep working (make a teammate,
  // use the computer) while the account goes, and erases what Trigger.dev
  // holds for it (lib/trigger-session-erasure.ts)
  eraseChat: async (chatId) => {
    try {
      await eraseChatSession(chatId, "account_deleted")
    } catch (cause) {
      Sentry.captureException(cause)
      throw new Error("Couldn't close your conversations. Try again.")
    }
  },
  revokeApple: (userId, authorizationCode, assertHeld) =>
    revokeAppleSignIn(userId, authorizationCode, undefined, assertHeld),
  deleteComputer: deleteAccountComputer,
  deleteBot,
  disconnectChatGPT,
  disconnectApps,
  deleteUser: (userId) => deleteClerkUser(userId, clerk().users),
}

// Deletes the account and what it owns: the computer, bots, chats, memories,
// settings and app and ChatGPT connections, then the Clerk user, which ends
// every session. Each step can run again, so a failure part-way is retried by
// asking again. Usage and sandbox metering rows are kept, keyed by the now
// unused user ID, as the billing record. Conversation history (chat_transcripts)
// cascades with the chats, and each chat's sealing key with it, which leaves
// what Trigger.dev keeps of the messages unreadable; see docs/data-retention.md.
//
// Sign in with Apple is revoked before data is deleted. An Apple outage stops
// deletion for a retry; missing tokens return instructions for manual removal.
export async function deleteAccount(
  userId: string,
  steps = providerSteps,
  options: { appleAuthorizationCode?: string } = {}
): Promise<{ appleSignIn: AppleRevocation }> {
  const appleAuthorizationCode = appleAuthorizationCodeSchema
    .optional()
    .parse(options.appleAuthorizationCode)
  const perform = (assertHeld: () => void = () => {}) =>
    deleteAccountLocked(userId, steps, { appleAuthorizationCode }, assertHeld)
  // Release the original lease before acquiring a new one: the session can
  // disappear while Clerk deletion is in flight, admitting a late grant save.
  const initial = steps.withAppleLock
    ? await steps.withAppleLock(userId, perform)
    : await perform()
  let appleSignIn = initial.appleSignIn
  const sweep = async (assertHeld: () => void = () => {}) => {
    const final = await steps.revokeApple(userId, undefined, assertHeld)
    appleSignIn =
      appleSignIn === "manual" || final === "manual"
        ? "manual"
        : appleSignIn === "revoked" || final === "revoked"
          ? "revoked"
          : "none"
    assertHeld()
    await (steps.deleteAppleGrants ?? deleteAppleGrantRows)(userId, assertHeld)
    assertHeld()
    return final
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (steps.withAppleLock) await steps.withAppleLock(userId, sweep)
      else await sweep()
      return { appleSignIn }
    } catch (cause) {
      if (attempt < 3) continue
      Sentry.captureMessage(
        "Apple grant cleanup failed after account deletion",
        {
          level: "error",
          tags: { area: "apple-signin", step: "post_account_cleanup" },
          user: { id: userId },
        }
      )
      throw cause
    }
  }
  throw new Error("Account cleanup did not finish. Try again.")
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

  // Erase and close sessions before their IDs disappear with the bots and group
  // chats. Their keys go with the chat rows below. A few at a time: each is
  // several Trigger.dev calls, and the person is waiting on the request.
  const ownedChats = await db
    .select({ id: chats.id })
    .from(chats)
    .where(eq(chats.userId, userId))
  for (let i = 0; i < ownedChats.length; i += 5)
    await Promise.all(
      ownedChats.slice(i, i + 5).map((chat) => steps.eraseChat(chat.id))
    )

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
    // Routines, approvals and approval rules went with the bots and chats.
    // Usage holds stay: the settle job books them into the billing record.
    await tx.delete(activityEvents).where(eq(activityEvents.userId, userId))
    await tx.delete(pushDevices).where(eq(pushDevices.userId, userId))
    await tx.delete(accountPlans).where(eq(accountPlans.userId, userId))
    assertHeld()
  })
  assertHeld()

  // The computer last, once no bot is left: from here on nothing can create or
  // register one (lib/account-computer.ts), and one registered before is
  // removed under the account's lock. A failure here is retried by asking
  // again; the row stays until it succeeds.
  await steps.deleteComputer(userId)

  assertHeld()
  await steps.deleteUser(userId)

  return { appleSignIn }
}

async function deleteAppleGrantRows(userId: string, assertHeld: () => void) {
  await db.transaction(async (tx) => {
    await tx
      .delete(appleSignInGrants)
      .where(eq(appleSignInGrants.userId, userId))
    assertHeld()
  })
}

// Confirm an uncertain provider response instead of treating a timeout as
// proof of deletion. Only an authenticated Clerk lookup returning 404 qualifies.
export async function deleteClerkUser(
  userId: string,
  users: {
    deleteUser: (id: string) => Promise<unknown>
    getUser: (id: string) => Promise<unknown>
  }
) {
  try {
    await users.deleteUser(userId)
  } catch {
    try {
      await users.getUser(userId)
    } catch (cause) {
      if ((cause as { status?: number })?.status === 404) return
    }
    Sentry.captureMessage("Account deletion provider result is unconfirmed", {
      level: "error",
      tags: { area: "apple-signin", step: "delete_user" },
      user: { id: userId },
    })
    throw new Error("Couldn't delete your account. Try again.")
  }
}
