export type BotActivity = "working" | "queued" | "ready" | "setup" | "unknown"
export type WorkspaceBot = {
  id: string
  name: string
  job: string
  avatar: string
  chatId: string | null
  activity: BotActivity
}

type ActivityChat = { id: string; kind: "direct" | "group"; botIds: string[] }
type ActivityRun = { tags: string[]; status: string; metadata?: unknown }

// Only a run in an owned chat can mark one of that chat's bots as active.
export function botActivityFromRuns(
  chats: ActivityChat[],
  runs: ActivityRun[]
) {
  const byTag = new Map(chats.map((chat) => [`chat:${chat.id}`, chat]))
  const activity = new Map<string, "working" | "queued">()
  for (const run of runs) {
    if (
      ![
        "EXECUTING",
        "QUEUED",
        "DEQUEUED",
        "DELAYED",
        "PENDING_VERSION",
      ].includes(run.status)
    )
      continue
    const chat = run.tags.map((tag) => byTag.get(tag)).find(Boolean)
    if (!chat) continue
    const metadata = run.metadata
    const author =
      metadata && typeof metadata === "object" && "botId" in metadata
        ? metadata.botId
        : undefined
    const botId =
      typeof author === "string" && chat.botIds.includes(author)
        ? author
        : chat.kind === "direct"
          ? chat.botIds[0]
          : undefined
    if (!botId) continue
    const state = run.status === "EXECUTING" ? "working" : "queued"
    if (activity.get(botId) !== "working") activity.set(botId, state)
  }
  return activity
}
