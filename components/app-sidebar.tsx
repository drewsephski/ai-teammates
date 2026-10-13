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
          <SidebarGroup aria-label="Conversations" className="px-3">
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {chats.map((chat) => (
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
