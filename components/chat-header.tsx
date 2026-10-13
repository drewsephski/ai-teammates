"use client"

import { MonitorIcon } from "lucide-react"

import { BotDialog } from "@/components/bot-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
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

  return (
    <Button
      variant="ghost"
      size="sm"
      className="ml-auto rounded-full text-muted-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
      aria-label="Desktop"
      aria-pressed={desktopPanel.open}
      onClick={desktopPanel.toggle}
    >
      <MonitorIcon />
      <span className="hidden sm:inline">Desktop</span>
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
              className="size-6"
            />
            <span className="truncate">{chat.name}</span>
          </GroupChatDialog>
        </h1>
      ) : (
        <>
          <h1 className="absolute left-1/2 flex max-w-[calc(100%-8rem)] min-w-0 -translate-x-1/2">
            {!chat.bots[0].setupComplete ? <span className="inline-flex h-8 min-w-0 items-center gap-2 rounded-full bg-muted/40 px-3 text-xs font-medium">
              <ChatAvatar seed={chat.bots[0].avatar} className="size-6" />
              <span className="truncate">{chat.bots[0].name}</span>
            </span> :
            <BotDialog
              bot={chat.bots[0]}
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 min-w-0 shrink gap-2 bg-muted/40 px-3 text-xs"
                />
              }
            >
              <ChatAvatar seed={chat.bots[0].avatar} className="size-6" />
              <span className="truncate">{chat.name ?? chat.bots[0].name}</span>
            </BotDialog>}
          </h1>
          <DesktopButton />
        </>
      )}
    </header>
  )
}

export { ChatHeader }
