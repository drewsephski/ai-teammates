"use client"

import { useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { BrainIcon, PinIcon, PinOffIcon, SearchIcon } from "lucide-react"

import { updateMemory } from "@/actions/memory"
import { MemoryDeleteDialog } from "@/components/memory/memory-delete-dialog"
import { MemoryEditDialog } from "@/components/memory/memory-edit-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { toast } from "@/components/ui/toast"
import type { Memory } from "@/db/schema"
import { memoryKindLabels, memoryKinds } from "@/lib/memory-policy"

export type ListedMemory = Pick<
  Memory,
  | "id"
  | "kind"
  | "content"
  | "botId"
  | "pinned"
  | "source"
  | "sourceChatId"
  | "createdAt"
>
export type Teammate = { id: string; name: string }

function MemoryItem({
  memory,
  teammates,
}: {
  memory: ListedMemory
  teammates: Teammate[]
}) {
  const [pinning, setPinning] = useState(false)
  const teammate = teammates.find((bot) => bot.id === memory.botId)
  const togglePin = async () => {
    setPinning(true)
    try {
      await updateMemory(memory.id, {
        content: memory.content,
        kind: memory.kind,
        botId: memory.botId,
        pinned: !memory.pinned,
      })
    } catch {
      toast.add({ type: "error", title: "Couldn't change the pin" })
    } finally {
      setPinning(false)
    }
  }
  const when = format(memory.createdAt, "MMM d")

  return (
    <li className="flex items-start gap-3 rounded-xl p-3 hover:bg-muted/50">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-sm break-words">{memory.content}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {memory.pinned && <Badge variant="secondary">Pinned</Badge>}
          <Badge variant="outline">
            {teammate ? `${teammate.name} only` : "All teammates"}
          </Badge>
          {memory.sourceChatId ? (
            <Link
              href={`/chats/${memory.sourceChatId}`}
              className="underline-offset-4 hover:underline"
            >
              From a chat · {when}
            </Link>
          ) : (
            <span>
              {memory.source === "user_edit" ? "Added by you" : "Saved"} ·{" "}
              {when}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={memory.pinned ? "Unpin" : "Pin to every chat"}
          title={memory.pinned ? "Unpin" : "Pin to every chat"}
          disabled={pinning}
          onClick={togglePin}
        >
          {memory.pinned ? <PinOffIcon /> : <PinIcon />}
        </Button>
        <MemoryEditDialog memory={memory} teammates={teammates} />
        <MemoryDeleteDialog memory={memory} />
      </div>
    </li>
  )
}

export function MemoryList({
  memories,
  teammates,
}: {
  memories: ListedMemory[]
  teammates: Teammate[]
}) {
  const [query, setQuery] = useState("")
  const needle = query.trim().toLowerCase()
  const shown = needle
    ? memories.filter((memory) => memory.content.toLowerCase().includes(needle))
    : memories

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium">Memories</h2>
          <p className="text-sm text-muted-foreground">
            Pinned memories are in every chat. The rest come up when
            they&apos;re relevant.
          </p>
        </div>
        {memories.length > 0 && (
          <InputGroup className="w-full sm:w-64">
            <InputGroupInput
              type="search"
              aria-label="Search memories"
              placeholder="Search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
          </InputGroup>
        )}
      </div>
      {shown.length === 0 ? (
        <Empty className="rounded-2xl border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BrainIcon />
            </EmptyMedia>
            <EmptyTitle>
              {memories.length ? "No matching memories" : "Nothing saved yet"}
            </EmptyTitle>
            <EmptyDescription>
              {memories.length
                ? "Try another word."
                : "Ask any teammate to remember something, and it shows up here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        memoryKinds.map((kind) => {
          const group = shown.filter((memory) => memory.kind === kind)
          if (!group.length) return null
          return (
            <section key={kind} className="flex flex-col gap-1">
              <h3 className="px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {memoryKindLabels[kind]}
              </h3>
              <ul className="flex flex-col">
                {group.map((memory) => (
                  <MemoryItem
                    key={memory.id}
                    memory={memory}
                    teammates={teammates}
                  />
                ))}
              </ul>
            </section>
          )
        })
      )}
    </div>
  )
}
