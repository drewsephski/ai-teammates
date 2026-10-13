"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { PencilIcon, Trash2Icon, PinIcon, PinOffIcon } from "lucide-react"
import { setBotPinned } from "@/actions/bot"
import { toast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

import { BotDeleteDialog } from "@/components/bot-delete-dialog"
import { BotDialog } from "@/components/bot-dialog"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar"
import type { Bot } from "@/db/schema"

// Children are rendered by the server so the avatars stay out of the client bundle
function ChatMenuButton({
  chatId,
  tooltip,
  children,
  bot,
  tile = false,
  activeChatIds,
}: {
  chatId: string
  tooltip: string
  children: React.ReactNode
  bot?: Bot
  tile?: boolean
  activeChatIds?: string[]
}) {
  const params = useParams<{ chatId?: string }>()
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const isActive =
    params.chatId === chatId || !!activeChatIds?.includes(params.chatId ?? "")
  const [pinPending, setPinPending] = useState(false)
  const { isMobile, setOpenMobile } = useSidebar()

  const button = (
    <SidebarMenuButton
      size="lg"
      tooltip={tooltip}
      isActive={isActive}
      className={cn(
        "h-12 gap-2 rounded-xl px-2",
        tile && "h-auto flex-col gap-1 py-3 text-center"
      )}
      onClick={() => {
        if (isMobile) setOpenMobile(false)
      }}
      render={
        <Link
          href={`/chats/${chatId}`}
          aria-current={isActive ? "page" : undefined}
        />
      }
    >
      {children}
    </SidebarMenuButton>
  )

  if (!bot) return button

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger render={button} />
        <ContextMenuContent>
          <ContextMenuGroup>
            <ContextMenuItem
              disabled={pinPending}
              onClick={async () => {
                setPinPending(true)
                try {
                  await setBotPinned(bot.id, !bot.pinnedAt)
                  router.refresh()
                } catch {
                  toast.add({
                    type: "error",
                    title: "Couldn't update your pinned bots",
                    description: "Try again.",
                  })
                } finally {
                  setPinPending(false)
                }
              }}
            >
              {bot.pinnedAt ? <PinOffIcon /> : <PinIcon />}
              {bot.pinnedAt ? "Unpin" : "Pin"}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => {
              if (!bot.setupComplete) router.push(`/chats/${chatId}`)
              else setEditOpen(true)
            }}>
              <PencilIcon />
              {bot.setupComplete ? "Edit bot" : "Configure in chat"}
            </ContextMenuItem>
          </ContextMenuGroup>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuItem
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2Icon />
              Delete bot
            </ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
      <BotDialog bot={bot} open={editOpen} onOpenChange={setEditOpen} />
      <BotDeleteDialog
        bot={bot}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => {
          if (isActive) router.push("/workspace")
        }}
      />
    </>
  )
}

export { ChatMenuButton }
