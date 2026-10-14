import { chatPreview } from "./chat-preview"

type SearchableChat = {
  name: string | null
  lastMessagePreview: string | null
  bots: { name: string; job: string | null }[]
}

export function chatSearchContent(chat: SearchableChat) {
  const title = chat.name?.trim() || chat.bots[0]?.name || "Conversation"
  const teammates = chat.bots
    .map((bot) => [bot.name, bot.job?.trim()].filter(Boolean).join(" · "))
    .join(", ")
  const preview = chatPreview(chat.lastMessagePreview ?? "")
  const keywords = [
    title,
    ...chat.bots.flatMap((bot) => [bot.name, bot.job?.trim() ?? ""]),
    preview,
  ].filter(Boolean)

  return { title, teammates, preview, keywords }
}
