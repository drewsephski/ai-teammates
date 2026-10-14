"use client"

import { useState } from "react"
import { DownloadIcon, MonitorIcon } from "lucide-react"

import { loadTranscript } from "@/actions/chat"
import { useBotSettings } from "@/components/bot-settings-panel"
import { ChatAvatar } from "@/components/chat-avatar"
import { useChatActivity } from "@/components/chat-activity-provider"
import { avatarStatusLabels } from "@/lib/avatar-state"
import { useDesktopPanel } from "@/components/desktop-panel"
import { GroupChatAvatar } from "@/components/group-chat-avatar"
import { GroupChatDialog } from "@/components/group-chat-dialog"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { toolCallText } from "@/components/chat-tool-call"
import { botSetupMessageId } from "@/lib/bot-setup-tools"
import { chatExportFileName, chatTranscriptMarkdown } from "@/lib/chat-export"
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
      className="rounded-full text-muted-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
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

// Downloads the stored transcript as Markdown. `bots` name consulted teammates.
function ExportChatButton({
  chat,
  bots,
}: {
  chat: ChatWithBots
  bots: Pick<Bot, "id" | "name">[]
}) {
  const [pending, setPending] = useState(false)

  async function exportChat() {
    setPending(true)
    try {
      const { messages = [] } = await loadTranscript({ chatId: chat.id })
      const title = chat.name ?? chat.bots[0]?.name ?? "Conversation"
      const directBotId = chat.kind === "direct" ? chat.bots[0]?.id : undefined
      const markdown = chatTranscriptMarkdown({
        title,
        // The hidden setup prompt isn't part of the conversation
        messages: messages.filter(
          (message) =>
            !directBotId || message.id !== botSetupMessageId(directBotId)
        ),
        bots: [...chat.bots, ...bots],
        fallbackBotId: chat.bots[0]?.id,
        group: chat.kind === "group",
        toolText: toolCallText,
      })
      const url = URL.createObjectURL(
        new Blob([markdown], { type: "text/markdown;charset=utf-8" })
      )
      const link = document.createElement("a")
      link.href = url
      link.download = chatExportFileName(title)
      link.click()
      setTimeout(() => URL.revokeObjectURL(url))
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't export the conversation",
        description: "Try again.",
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="rounded-full text-muted-foreground"
      aria-label="Export chat as Markdown"
      title="Export chat"
      disabled={pending}
      onClick={exportChat}
    >
      {pending ? <Spinner /> : <DownloadIcon />}
    </Button>
  )
}

// `bots` are all the user's bots: a group chat's possible members, and the
// names of teammates a chat consulted
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
        <h1 className="absolute left-1/2 flex max-w-[calc(100%-12rem)] min-w-0 -translate-x-1/2">
          <BotSettingsButton bot={chat.bots[0]} />
        </h1>
      )}
      <div className="ml-auto flex items-center gap-1">
        {chat.kind === "direct" && <DesktopButton />}
        <ExportChatButton chat={chat} bots={bots} />
      </div>
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
