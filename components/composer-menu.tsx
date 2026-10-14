"use client"

import { AtSignIcon, SlashIcon } from "lucide-react"
import {
  composerCommands,
  type ComposerCommand,
  type MentionBot,
} from "@/lib/composer"
import { cn } from "@/lib/utils"

export type ComposerOption = {
  id: string
  label: string
  description: string
} & ({ bot: MentionBot } | { command: (typeof composerCommands)[number] })

export function ComposerMenu({
  open,
  help,
  kind,
  options,
  selected,
  memberIds,
  listId,
  onClose,
  onCommand,
  onChoose,
  setOptionRef,
}: {
  open: boolean
  help: boolean
  kind?: "command" | "mention"
  options: ComposerOption[]
  selected: number
  memberIds: string[]
  listId: string
  onClose: () => void
  onCommand: (command: ComposerCommand) => void
  onChoose: (index: number) => void
  setOptionRef: (index: number, element: HTMLButtonElement | null) => void
}) {
  return (
    <>
      {" "}
      {(open || help) && (
        <div className="absolute inset-x-0 bottom-full z-20 mb-2 overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
            <span>
              {help
                ? "Composer shortcuts"
                : kind === "command"
                  ? "Commands"
                  : "Your teammates · across all chats"}
            </span>
            <button
              type="button"
              className="px-2 py-1 hover:text-foreground"
              aria-label="Close composer menu"
              onClick={() => {
                onClose()
              }}
            >
              Close
            </button>
          </div>
          {help ? (
            <div className="max-h-64 overflow-y-auto p-3 text-sm">
              <p className="mb-3 text-muted-foreground">
                Type @ and pick a teammate to bring their perspective into this
                chat. Use /delegate to hand over execution. Select with ↑ ↓ and
                Enter or Tab; Esc closes the menu.
              </p>
              {composerCommands
                .filter((command) => command.name !== "help")
                .map((command) => (
                  <button
                    key={command.name}
                    type="button"
                    className="flex w-full gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted"
                    onClick={() => {
                      onCommand(command.name)
                    }}
                  >
                    <span className="w-24 shrink-0 font-medium">
                      /{command.name}
                    </span>
                    <span className="text-muted-foreground">
                      {command.description}
                    </span>
                  </button>
                ))}
            </div>
          ) : (
            <div
              id={listId}
              role="listbox"
              aria-label={
                kind === "command" ? "Slash commands" : "Mention a teammate"
              }
              className="max-h-60 overflow-y-auto p-1.5"
            >
              {options.map((option, index) => (
                <button
                  key={option.id}
                  id={`${listId}-${index}`}
                  ref={(element) => {
                    setOptionRef(index, element)
                  }}
                  type="button"
                  role="option"
                  aria-selected={index === selected}
                  tabIndex={-1}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left",
                    index === selected && "bg-muted"
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onChoose(index)}
                >
                  {"bot" in option ? (
                    <AtSignIcon className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <SlashIcon className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {option.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                  {"bot" in option && (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {memberIds.includes(option.id)
                        ? "In this chat"
                        : "Other chat"}
                    </span>
                  )}
                </button>
              ))}
              {!options.length && (
                <p
                  role="status"
                  className="px-3 py-4 text-sm text-muted-foreground"
                >
                  {kind === "mention"
                    ? "No matching teammates. Try a name or role."
                    : "No matching commands. Type /help to explore."}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
