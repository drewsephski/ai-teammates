import { z } from "zod"

export const sidebarOrderSchema = z
  .array(z.string().min(1).max(128))
  .min(1)
  .max(1000)
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate IDs")

export function applySidebarOrder<T extends { id: string }>(
  items: T[],
  ids: string[]
) {
  const ranks = new Map(ids.map((id, index) => [id, index]))
  return [...items].sort(
    (a, b) => (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity)
  )
}

type SidebarBot = { id: string; pinnedAt: Date | null }
type SidebarChat = { id: string; kind: "direct" | "group"; bots: SidebarBot[] }

// Pinned bots as tiles (each with its direct chats), then the other
// conversations in the person's saved order
export function sidebarSections<
  B extends SidebarBot,
  C extends SidebarChat & { bots: B[] },
>(chats: C[], bots: B[], conversationOrder: string[]) {
  const pinned = bots
    .filter((bot) => bot.pinnedAt)
    .sort(
      (a, b) =>
        a.pinnedAt!.getTime() - b.pinnedAt!.getTime() ||
        a.id.localeCompare(b.id)
    )
    .flatMap((bot) => {
      const direct = chats.filter(
        (chat) => chat.kind === "direct" && chat.bots[0].id === bot.id
      )
      return direct.length > 0
        ? [{ bot, chat: direct[0], chatIds: direct.map((chat) => chat.id) }]
        : []
    })
  const conversations = applySidebarOrder(
    chats.filter((chat) => chat.kind !== "direct" || !chat.bots[0].pinnedAt),
    conversationOrder
  )
  return { pinned, conversations }
}
