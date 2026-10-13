"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { PencilIcon, Trash2Icon } from "lucide-react"

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
import { SidebarMenuButton } from "@/components/ui/sidebar"
import type { Bot } from "@/db/schema"

// Children are rendered by the server so the avatars stay out of the client bundle
function ChatMenuButton({
  chatId,
  tooltip,
  children,
  bot,
}: {
  chatId: string
  tooltip: string
  children: React.ReactNode
  bot?: Bot
}) {
  const params = useParams<{ chatId?: string }>()
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const isActive = params.chatId === chatId

  const button = (
    <SidebarMenuButton
      size="lg"
      tooltip={tooltip}
      isActive={isActive}
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
            <ContextMenuItem onClick={() => setEditOpen(true)}>
              <PencilIcon />
              Edit bot
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
          if (isActive) router.push("/")
        }}
      />
    </>
  )
}

export { ChatMenuButton }
