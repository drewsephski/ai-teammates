import { createClerkClient } from "@clerk/backend"
import * as Sentry from "@sentry/nextjs"
import { ApiError as TriggerApiError, sessions } from "@trigger.dev/sdk"
import { eq } from "drizzle-orm"

import { db } from "@/db"
import {
  accountPlans,
  activityEvents,
  bots,
  chatgptConnections,
  chats,
  computers,
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
import { deleteBot } from "@/services/bots"

type Steps = {
  cancelSubscriptions: (userId: string) => Promise<void>
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
  cancelSubscriptions: async (userId) => {
    try {
      await cancelAccountSubscriptions(userId, clerk().billing)
    } catch (cause) {
      Sentry.captureException(cause)
      throw new Error("Couldn't cancel your subscription. Try again.")
    }
  },
  closeChat: async (chatId) => {
    try {
      await sessions.close(chatId, { reason: "account_deleted" })
    } catch (cause) {
      if (cause instanceof TriggerApiError && cause.status === 404) return
      Sentry.captureException(cause)
      throw new Error("Couldn't close your conversations. Try again.")
    }
  },
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
// unused user ID, as the billing record. Conversation transcripts stored with
// Trigger.dev sessions are not removed here.
export async function deleteAccount(userId: string, steps = providerSteps) {
  // Do not leave a recurring charge attached to an account that cannot sign in.
  // A billing failure leaves the workspace intact so the person can retry.
  await steps.cancelSubscriptions(userId)

  // Close sessions before their IDs disappear with the bots and group chats.
  // Closing prevents more messages; it does not erase provider transcripts.
  const ownedChats = await db
    .select({ id: chats.id })
    .from(chats)
    .where(eq(chats.userId, userId))
  for (const chat of ownedChats) await steps.closeChat(chat.id)

  const owned = await db
    .select({ id: bots.id })
    .from(bots)
    .where(eq(bots.userId, userId))
  for (const bot of owned) await steps.deleteBot(userId, bot.id)

  // The computer after the bots: with no bot left, a turn still running can't
  // create it again (lib/account-computer.ts). A failure here is retried by
  // asking again; the row stays until it succeeds.
  await steps.deleteComputer(userId)

  await steps.disconnectChatGPT(userId)
  await steps.disconnectApps(userId)

  await db.transaction(async (tx) => {
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
    // deleteComputer removed it. A computer created since becomes an orphan,
    // which the metering cron deletes
    await tx.delete(computers).where(eq(computers.userId, userId))
  })

  await steps.deleteUser(userId)
}
