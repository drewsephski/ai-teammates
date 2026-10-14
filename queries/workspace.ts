import * as Sentry from "@sentry/nextjs"
import { runs } from "@trigger.dev/sdk"
import { getBots, getChats } from "@/queries/bots"
import {
  botActivityFromRuns,
  type WorkspaceBot,
} from "@/lib/workspace-activity"

export async function getWorkspaceBots(): Promise<WorkspaceBot[]> {
  const [bots, chats] = await Promise.all([getBots(), getChats()])
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
