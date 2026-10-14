"use client"

import { MonitorIcon } from "lucide-react"

import { useBotSettings } from "@/components/bot-settings-panel"
import { ChatAvatar } from "@/components/chat-avatar"
import { useChatActivity } from "@/components/chat-activity-provider"
import { avatarStatusLabels } from "@/lib/avatar-state"
import { useDesktopPanel } from "@/components/desktop-panel"
import { GroupChatAvatar } from "@/components/group-chat-avatar"
import { GroupChatDialog } from "@/components/group-chat-dialog"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import type { Bot } from "@/db/schema"
import type { ChatWithBots } from "@/queries/bots"

// Only rendered in direct chats, the only ones inside a DesktopPanelProvider
function DesktopButton() {
  const desktopPanel = useDesktopPanel()
  const settings = useBotSettings()

  return (
    <Button
      variant="ghost"
      size="sm"
      className="ml-auto rounded-full text-muted-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
      aria-label="Desktop"
      aria-pressed={desktopPanel.open}
      onClick={() => {
        settings.close(false)
        desktopPanel.toggle()
      }}
    >
      <MonitorIcon />
      <span className="hidden sm:inline">Desktop</span>
    </Button>
  )
}

function BotSettingsButton({ bot }: { bot: Bot }) {
  const settings = useBotSettings()
  const activity = useChatActivity()
  const state = activity.botId === bot.id ? activity.state : "idle"
  return (
    <Button
      id="bot-settings-trigger"
      variant="ghost"
      size="sm"
      className="h-8 min-w-0 shrink gap-2 bg-muted/40 px-3 text-xs"
      aria-label={`Settings for ${bot.name}`}
      aria-expanded={settings.open}
      aria-controls="bot-config-panel"
      onClick={() => (settings.open ? settings.close() : settings.show())}
    >
      <ChatAvatar
        seed={bot.avatar}
        identity={bot.id}
        state={state}
        interactive
        className="size-6"
      />
      <span className="truncate">{bot.name}</span>
    </Button>
  )
}

// `bots` are all the user's bots, the ones a group chat can have as members
function ChatHeader({
  chat,
  bots = [],
}: {
  chat: ChatWithBots
  bots?: Pick<Bot, "id" | "name" | "avatar">[]
}) {
  const activity = useChatActivity()
  const author = chat.bots.find((bot) => bot.id === activity.botId)
  const label = author && avatarStatusLabels[activity.state]
  return (
    <header
      data-slot="chat-header"
      className="relative flex h-12 shrink-0 items-center gap-3 border-b border-border/60 px-4"
    >
      <SidebarTrigger className="text-muted-foreground" />
      {chat.kind === "group" ? (
        <h1 className="absolute left-1/2 flex max-w-[calc(100%-8rem)] min-w-0 -translate-x-1/2">
          <GroupChatDialog
            chat={chat}
            bots={bots}
            trigger={
              <Button
                variant="ghost"
                size="sm"
                className="h-8 min-w-0 shrink gap-2 bg-muted/40 px-3 text-xs"
              />
            }
          >
            <GroupChatAvatar
              seeds={chat.bots.map((bot) => bot.avatar)}
              identities={chat.bots.map((bot) => bot.id)}
              states={chat.bots.map((bot) =>
                bot.id === activity.botId ? activity.state : "idle"
              )}
              interactive
              className="size-6"
            />
            <span className="truncate">{chat.name}</span>
          </GroupChatDialog>
        </h1>
      ) : (
        <>
          <h1 className="absolute left-1/2 flex max-w-[calc(100%-8rem)] min-w-0 -translate-x-1/2">
            <BotSettingsButton bot={chat.bots[0]} />
          </h1>
          <DesktopButton />
        </>
      )}
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {label ? `${author.name}: ${label}` : ""}
      </span>
    </header>
  )
}

export { ChatHeader }
