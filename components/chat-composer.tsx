"use client"

import { useId, useRef, useState, type ReactNode, type RefObject } from "react"
import { AtSignIcon, SlashIcon } from "lucide-react"
import {
  PromptInput,
  PromptInputTextarea,
  usePromptInputController,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"
import {
  composerCommands,
  composerTrigger,
  parseComposerCommand,
  reconcileMentions,
  type BotMention,
  type MentionBot,
} from "@/lib/composer"
import { toast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

export function ChatComposer({
  bots,
  memberIds,
  inputRef,
  placeholder,
  textareaClassName,
  onSubmit,
  children,
}: {
  bots: MentionBot[]
  memberIds: string[]
  inputRef: RefObject<HTMLTextAreaElement | null>
  placeholder: string
  textareaClassName?: string
  onSubmit: (message: PromptInputMessage, mentions: BotMention[]) => boolean | void | Promise<boolean | void>
  children: ReactNode
}) {
  const { textInput } = usePromptInputController()
  const [draftTags, setDraftTags] = useState<{
    text: string
    mentions: BotMention[]
  }>({ text: "", mentions: [] })
  const mentions = reconcileMentions(
    draftTags.text,
    textInput.value,
    draftTags.mentions
  )
  if (draftTags.text !== textInput.value) {
    setDraftTags({ text: textInput.value, mentions })
  }
  const [caret, setCaret] = useState(0)
  const [dismissed, setDismissed] = useState<string>()
  const [active, setActive] = useState(0)
  const [help, setHelp] = useState(false)
  const listId = useId()
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const trigger = composerTrigger(textInput.value, caret, mentions)
  const triggerKey =
    trigger && `${trigger.kind}:${trigger.start}:${trigger.query}`
  const options =
    trigger?.kind === "command"
      ? composerCommands
          .filter((command) => command.name.includes(trigger.query))
          .map((command) => ({
            id: command.name,
            label: `/${command.name}`,
            description: command.description,
            command,
          }))
      : trigger?.kind === "mention"
        ? bots
            .filter((bot) =>
              `${bot.name} ${bot.job}`.toLowerCase().includes(trigger.query)
            )
            .slice(0, 20)
            .map((bot) => ({
              id: bot.id,
              label: bot.name,
              description: bot.job,
              bot,
            }))
        : []
  const open = Boolean(trigger && dismissed !== triggerKey)
  const selected = Math.min(active, Math.max(0, options.length - 1))

  function replace(
    start: number,
    end: number,
    replacement: string,
    bot?: MentionBot
  ) {
    const value =
      textInput.value.slice(0, start) + replacement + textInput.value.slice(end)
    const nextMentions = reconcileMentions(textInput.value, value, mentions)
    if (bot)
      nextMentions.push({
        botId: bot.id,
        start,
        end: start + replacement.trimEnd().length,
      })
    setDraftTags({ text: value, mentions: nextMentions })
    textInput.setInput(value)
    const position = start + replacement.length
    setCaret(position)
    setActive(0)
    setDismissed(undefined)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(position, position)
    })
  }

  function choose(index: number) {
    const option = options[index]
    if (!trigger || !option) return
    if ("bot" in option) {
      if (
        mentions.length >= 5
      ) {
        toast.add({
          type: "error",
          title: "Tag up to five teammates per message",
        })
        return
      }
      replace(trigger.start, trigger.end, `@${option.bot.name} `, option.bot)
    } else if (option.command.name === "help") {
      setHelp(true)
      replace(trigger.start, trigger.end, "")
    } else
      replace(
        trigger.start,
        trigger.end,
        `/${option.command.name} ${["ask", "delegate"].includes(option.command.name) ? "@" : ""}`
      )
  }

  function show(kind: "/" | "@") {
    setHelp(false)
    setDismissed(undefined)
    setActive(0)
    if (kind === "/") {
      if (/^\s*\//.test(textInput.value)) {
        const end = /^\s*\/[a-z]*/i.exec(textInput.value)![0].length
        setCaret(end)
        inputRef.current?.setSelectionRange(end, end)
        inputRef.current?.focus()
        return
      }
      replace(0, 0, "/")
    } else {
      const position =
        inputRef.current?.selectionStart ?? textInput.value.length
      const prefix =
        position > 0 && !/\s/.test(textInput.value[position - 1]) ? " @" : "@"
      replace(position, position, prefix)
    }
  }

  return (
    <div className="relative">
      {(open || help) && (
        <div className="absolute inset-x-0 bottom-full z-20 mb-2 overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
            <span>
              {help
                ? "Composer shortcuts"
                : trigger?.kind === "command"
                  ? "Commands"
                  : "Your teammates · across all chats"}
            </span>
            <button
              type="button"
              className="px-2 py-1 hover:text-foreground"
              aria-label="Close composer menu"
              onClick={() => {
                setHelp(false)
                setDismissed(triggerKey)
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
                      setHelp(false)
                      replace(
                        0,
                        0,
                        `/${command.name} ${["ask", "delegate"].includes(command.name) ? "@" : ""}`
                      )
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
                trigger?.kind === "command"
                  ? "Slash commands"
                  : "Mention a teammate"
              }
              className="max-h-60 overflow-y-auto p-1.5"
            >
              {options.map((option, index) => (
                <button
                  key={option.id}
                  id={`${listId}-${index}`}
                  ref={(element) => {
                    optionRefs.current[index] = element
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
                  onClick={() => choose(index)}
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
                  {trigger?.kind === "mention"
                    ? "No matching teammates. Try a name or role."
                    : "No matching commands. Type /help to explore."}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      <PromptInput
        onSubmit={(message) => {
          const parsed = parseComposerCommand(message.text)
          if (parsed?.command?.name === "help") {
            setHelp(true)
            setDismissed(triggerKey)
            textInput.setInput(parsed.argument)
            return false
          }
          if (parsed && !parsed.command) {
            toast.add({
              type: "error",
              title: `Unknown command /${parsed.name}`,
              description: "Type /help to see available commands.",
            })
            return false
          }
          const task = mentions
            .reduceRight(
              (text, mention) =>
                text.slice(0, mention.start) + text.slice(mention.end),
              message.text
            )
            .replace(/^\s*\/\w+\s*/, "")
            .trim()
          if (
            parsed?.command &&
            ["ask", "delegate"].includes(parsed.command.name) &&
            (!mentions.length ||
              !task ||
              (parsed.command.name === "delegate" &&
                new Set(mentions.map((mention) => mention.botId)).size !== 1))
          ) {
            toast.add({
              type: "error",
              title:
                parsed.command.name === "delegate"
                  ? "Tag one teammate and add a task"
                  : "Tag a teammate and add a question",
            })
            return false
          }
          setDismissed(triggerKey)
          setHelp(false)
          return onSubmit(message, mentions)
        }}
      >
        <PromptInputTextarea
          ref={inputRef}
          aria-label="Message"
          aria-autocomplete="list"
          aria-controls={open ? listId : undefined}
          aria-expanded={open}
          aria-activedescendant={
            open && options.length ? `${listId}-${selected}` : undefined
          }
          placeholder={placeholder}
          className={textareaClassName}
          onChange={(event) => {
            setDraftTags({
              text: event.currentTarget.value,
              mentions: reconcileMentions(
                draftTags.text,
                event.currentTarget.value,
                draftTags.mentions
              ),
            })
            setCaret(event.currentTarget.selectionStart)
            setActive(0)
            setDismissed(undefined)
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === "Escape" && (open || help)) {
              event.preventDefault()
              setDismissed(triggerKey)
              setHelp(false)
              return
            }
            if (!open || !options.length) return
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault()
              const index =
                (selected +
                  (event.key === "ArrowDown" ? 1 : options.length - 1)) %
                options.length
              setActive(index)
              optionRefs.current[index]?.scrollIntoView?.({ block: "nearest" })
            }
            if (
              (event.key === "Enter" && !event.shiftKey) ||
              event.key === "Tab"
            ) {
              event.preventDefault()
              choose(selected)
            }
          }}
        />
        {children}
      </PromptInput>
      <div className="flex items-center gap-1 px-2 pt-1.5 text-xs text-muted-foreground">
        <button
          type="button"
          aria-label="Browse slash commands"
          className="flex min-h-8 items-center gap-1 rounded-md px-2 hover:bg-muted hover:text-foreground"
          onClick={() => show("/")}
        >
          <SlashIcon className="size-3" />
          Commands
        </button>
        <button
          type="button"
          aria-label="Mention a teammate"
          className="flex min-h-8 items-center gap-1 rounded-md px-2 hover:bg-muted hover:text-foreground"
          onClick={() => show("@")}
        >
          <AtSignIcon className="size-3" />
          Teammates
        </button>
        {mentions.length > 0 && (
          <span className="ml-auto truncate" role="status">
            {new Set(mentions.map((mention) => mention.botId)).size} tagged
          </span>
        )}
      </div>
    </div>
  )
}
