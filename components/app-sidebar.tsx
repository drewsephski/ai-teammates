import { formatDistanceToNowStrict } from "date-fns"
import { GaugeIcon, LayoutGridIcon, CreditCardIcon } from "lucide-react"

import { ChatAvatar } from "@/components/chat-avatar"
import { ChatMenuButton } from "@/components/chat-menu-button"
import { CreateMenu } from "@/components/create-menu"
import { ConnectorMarketplace } from "@/components/connector-marketplace"
import { GroupChatAvatar } from "@/components/group-chat-avatar"
import { SearchCommand, SearchCommandItem } from "@/components/search-command"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { UserMenu } from "@/components/user-menu"
import { KraftyWordmark } from "@/components/krafty-wordmark"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SidebarNavLink } from "@/components/sidebar-nav-link"
import { getBots, getChats, type ChatWithBots } from "@/queries/bots"

// A group shows its bots together, a direct chat shows its one bot
function SidebarChatAvatar({ chat }: { chat: ChatWithBots }) {
  return chat.kind === "group" ? (
    <GroupChatAvatar seeds={chat.bots.map((bot) => bot.avatar)} />
  ) : (
    <ChatAvatar seed={chat.bots[0].avatar} />
  )
}

export async function AppSidebar() {
  const [chats, bots] = await Promise.all([getChats(), getBots()])
  const pinned = bots
    .filter((bot) => bot.pinnedAt)
    .sort((a, b) => a.pinnedAt!.getTime() - b.pinnedAt!.getTime())
    .flatMap((bot) => {
      const chat = chats.find(
        (chat) => chat.kind === "direct" && chat.bots[0].id === bot.id
      )
      return chat
        ? [
            {
              bot,
              chat,
              chatIds: chats
                .filter(
                  (chat) => chat.kind === "direct" && chat.bots[0].id === bot.id
                )
                .map((chat) => chat.id),
            },
          ]
        : []
    })
  const unpinnedChats = chats.filter(
    (chat) => chat.kind !== "direct" || !chat.bots[0].pinnedAt
  )

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-4 px-4 py-5">
        <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:flex-col">
          <KraftyWordmark compact href="/workspace" />
          <CreateMenu
            bots={bots.map(({ id, name, avatar }) => ({ id, name, avatar }))}
          />
        </div>
        <SearchCommand>
          {chats.map((chat) => (
            <SearchCommandItem
              key={chat.id}
              href={`/chats/${chat.id}`}
              value={chat.id}
              keywords={[chat.name ?? chat.bots[0].name]}
            >
              <SidebarChatAvatar chat={chat} />
              <span className="truncate">{chat.name ?? chat.bots[0].name}</span>
            </SearchCommandItem>
          ))}
        </SearchCommand>
        <SidebarMenu className="gap-1">
          <SidebarMenuItem>
            <SidebarNavLink href="/workspace" label="Workspace">
              <LayoutGridIcon />
            </SidebarNavLink>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="overflow-hidden">
        <ScrollArea className="min-h-0 flex-1">
          {pinned.length > 0 && (
            <SidebarGroup aria-label="Pinned bots" className="px-3">
              <SidebarGroupContent>
                <SidebarMenu className="grid grid-cols-3 gap-1 group-data-[collapsible=icon]:grid-cols-1">
                  {pinned.map(({ bot, chat, chatIds }) => (
                    <SidebarMenuItem key={bot.id}>
                      <ChatMenuButton
                        chatId={chat.id}
                        tooltip={bot.name}
                        bot={bot}
                        tile
                        activeChatIds={chatIds}
                      >
                        <ChatAvatar
                          seed={bot.avatar}
                          className="size-12 group-data-[collapsible=icon]:size-6"
                        />
                        <span className="w-full truncate text-center text-xs font-medium group-data-[collapsible=icon]:hidden">
                          {bot.name}
                        </span>
                        {bot.setupComplete && (
                          <span className="max-w-full truncate rounded border border-sidebar-border px-1 text-[9px] text-muted-foreground group-data-[collapsible=icon]:hidden">
                            {bot.job}
                          </span>
                        )}
                      </ChatMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
          <SidebarGroup aria-label="Conversations" className="px-3">
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {unpinnedChats.map((chat) => (
                  <SidebarMenuItem key={chat.id}>
                    <ChatMenuButton
                      chatId={chat.id}
                      tooltip={chat.name ?? chat.bots[0].name}
                      bot={chat.kind === "direct" ? chat.bots[0] : undefined}
                    >
                      <SidebarChatAvatar chat={chat} />
                      <div className="grid flex-1 text-left leading-tight">
                        <div className="flex items-baseline gap-2">
                          <span className="truncate font-medium">
                            {chat.name ?? chat.bots[0].name}
                          </span>
                          <time
                            dateTime={chat.lastMessageAt.toISOString()}
                            className="ml-auto shrink-0 text-xs text-muted-foreground"
                          >
                            {formatDistanceToNowStrict(chat.lastMessageAt)}
                          </time>
                        </div>
                        {chat.lastMessagePreview && (
                          <span className="truncate text-xs text-muted-foreground">
                            {chat.lastMessagePreview}
                          </span>
                        )}
                      </div>
                    </ChatMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </ScrollArea>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        <SidebarMenu className="gap-1">
          <SidebarMenuItem>
            <ConnectorMarketplace />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarNavLink href="/usage" label="Usage">
              <GaugeIcon />
            </SidebarNavLink>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarNavLink href="/pricing" label="Plans & billing">
              <CreditCardIcon />
            </SidebarNavLink>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <UserMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
