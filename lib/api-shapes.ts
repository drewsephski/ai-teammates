import type { Bot, Chat } from "@/db/schema"
import type { botPresets } from "@/lib/bot-presets"

// What the native app sees of a bot: no owner or provider sandbox IDs
export function publicBot(bot: Bot) {
  return {
    id: bot.id,
    name: bot.name,
    avatar: bot.avatar,
    job: bot.job,
    instructions: bot.instructions,
    // Millionths of a dollar one task may spend; null is no limit. Added for
    // builds after 2026-10-27; older ones ignore it.
    taskBudget: bot.taskBudget,
    setupComplete: bot.setupComplete,
    pinnedAt: bot.pinnedAt,
    createdAt: bot.createdAt,
  }
}

export function publicChat(chat: Chat & { bots: Bot[] }) {
  return {
    id: chat.id,
    kind: chat.kind,
    name: chat.name,
    lastMessagePreview: chat.lastMessagePreview,
    lastMessageAt: chat.lastMessageAt,
    createdAt: chat.createdAt,
    memoryMode: chat.memoryMode,
    bots: chat.bots.map(publicBot),
  }
}

export type PublicBot = ReturnType<typeof publicBot>
export type PublicChat = ReturnType<typeof publicChat>

// A starting role for a new bot, without its web icon or full instructions
export function publicPreset(preset: (typeof botPresets)[number]) {
  return {
    id: preset.id,
    name: preset.name,
    label: preset.label,
    summary: preset.summary,
    job: preset.job,
    description: preset.description,
    prompt: preset.prompt,
    suggestedApps: [...preset.suggestedApps],
  }
}

export type PublicPreset = ReturnType<typeof publicPreset>
