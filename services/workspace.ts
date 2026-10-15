import * as Sentry from "@sentry/nextjs"
import { runs } from "@trigger.dev/sdk"

import { listBots } from "@/services/bots"
import { listChats } from "@/services/chats"
import {
  botActivityFromRuns,
  type WorkspaceBot,
} from "@/lib/workspace-activity"

// Each of this user's bots with what it is doing now, from the chat runs in
// their own chats only. Shared by the web workspace and /api/v1/bots/activity.
export async function listWorkspaceBots(
  userId: string
): Promise<WorkspaceBot[]> {
  const [bots, chats] = await Promise.all([
    listBots(userId),
    listChats(userId),
  ])
  if (!bots.length) return []
  const activityChats = chats.map((chat) => ({
    id: chat.id,
    kind: chat.kind,
    botIds: chat.bots.map((bot) => bot.id),
  }))
  let activity = new Map<string, "working" | "queued">()
  let available = true
  try {
    const active = []
    if (chats.length)
      for await (const run of runs.list(
        {
          taskIdentifier: "chat",
          tag: chats.map((chat) => `chat:${chat.id}`),
          status: [
            "EXECUTING",
            "QUEUED",
            "DEQUEUED",
            "DELAYED",
            "PENDING_VERSION",
          ],
          limit: 100,
        },
        { retry: { maxAttempts: 1 } }
      ))
        active.push(run)
    activity = botActivityFromRuns(activityChats, active)
  } catch (error) {
    available = false
    Sentry.captureException(error, { tags: { surface: "workspace-activity" } })
  }
  return bots.map((bot) => ({
    id: bot.id,
    name: bot.name,
    job: bot.job,
    avatar: bot.avatar,
    chatId:
      chats.find(
        (chat) =>
          chat.kind === "direct" &&
          chat.bots.some((member) => member.id === bot.id)
      )?.id ?? null,
    activity:
      activity.get(bot.id) ??
      (!available ? "unknown" : !bot.setupComplete ? "setup" : "ready"),
  }))
}
