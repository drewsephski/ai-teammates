import { Suspense } from "react"
import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"

import { Chat } from "@/components/chat"
import { ChatHeader } from "@/components/chat-header"
import { ChatActivityProvider } from "@/components/chat-activity-provider"
import {
  BotSettingsPanel,
  BotSettingsProvider,
} from "@/components/bot-settings-panel"
import { DesktopPanel, DesktopPanelProvider } from "@/components/desktop-panel"
import { UsageNotice } from "@/components/usage-notice"
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { getBots } from "@/queries/bots"
import { getChat } from "@/queries/chats"

export default async function Page({
  params,
}: {
  params: Promise<{ chatId: string }>
}) {
  await auth.protect()

  const { chatId } = await params
  const chat = await getChat(chatId)
  if (!chat) notFound()

  const bots = await getBots()
  const mentionBots = bots.map(({ id, name, avatar, job }) => ({
    id,
    name,
    avatar,
    job,
  }))
  const headerBots = bots.map(({ id, name, avatar }) => ({ id, name, avatar }))
  // Streams in after the chat, so a slow billing lookup never holds it up
  const notice = (
    <Suspense fallback={null}>
      <UsageNotice />
    </Suspense>
  )

  // A group has several bots and so no single desktop to show
  if (chat.kind === "group") {
    return (
      <ChatActivityProvider key={chat.id}>
        <div className="chat-surface flex h-svh flex-col">
          <ChatHeader chat={chat} bots={headerBots} />
          <Chat
            chatId={chat.id}
            mentionBots={mentionBots}
            notice={notice}
            name={chat.name ?? "your teammates"}
            bots={chat.bots.map(({ id, name, avatar }) => ({
              id,
              name,
              avatar,
            }))}
          />
        </div>
      </ChatActivityProvider>
    )
  }

  return (
    <ChatActivityProvider key={chat.id}>
      <DesktopPanelProvider key={chat.id} chatId={chat.id}>
        <BotSettingsProvider>
          {/* The group sizes itself to its parent, so the viewport height goes here */}
          <div className="chat-surface h-svh">
            <ResizablePanelGroup orientation="horizontal">
              <ResizablePanel id="chat" minSize="30%">
                <div className="flex h-full flex-col">
                  <ChatHeader chat={chat} bots={headerBots} />
                  <Chat
                    chatId={chat.id}
                    mentionBots={mentionBots}
                    notice={notice}
                    name={chat.name ?? chat.bots[0].name}
                    botId={chat.bots[0].id}
                    directBot={{
                      id: chat.bots[0].id,
                      name: chat.bots[0].name,
                      avatar: chat.bots[0].avatar,
                    }}
                    setup={
                      !chat.bots[0].setupComplete || !chat.lastMessagePreview
                    }
                  />
                </div>
              </ResizablePanel>
              <DesktopPanel name={chat.bots[0].name} />
              <BotSettingsPanel bot={chat.bots[0]} />
            </ResizablePanelGroup>
          </div>
        </BotSettingsProvider>
      </DesktopPanelProvider>
    </ChatActivityProvider>
  )
}
