"use client"

import { useId, useRef, useState } from "react"
import { AtSignIcon, ArrowUpIcon } from "lucide-react"
import {
  composerTrigger,
  reconcileMentions,
  type BotMention,
} from "@/lib/composer"
import { DemoAvatar } from "./chat-demo-avatar"
import type { DemoAgent } from "./chat-demo-data"
import styles from "./chat-demo.module.css"

export function DemoComposer({
  bots,
  name,
  disabled,
  demoDraft = "",
  onSend,
}: {
  bots: DemoAgent[]
  name: string
  disabled: boolean
  demoDraft?: string
  onSend: (text: string, mentions: BotMention[]) => void
}) {
  const input = useRef<HTMLTextAreaElement>(null)
  const listId = useId()
  const [text, setText] = useState("")
  const [mentions, setMentions] = useState<BotMention[]>([])
  const [caret, setCaret] = useState(0)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState<string>()
  const trigger = composerTrigger(text, caret, mentions)
  const key = trigger && `${trigger.start}:${trigger.query}`
  const open = trigger?.kind === "mention" && dismissed !== key
  const matches = open
    ? bots.filter((bot) =>
        `${bot.name} ${bot.description}`.toLowerCase().includes(trigger.query)
      )
    : []
  const selected = Math.min(active, Math.max(matches.length - 1, 0))
  function update(value: string, position: number) {
    setMentions(reconcileMentions(text, value, mentions))
    setText(value)
    setCaret(position)
    setActive(0)
    setDismissed(undefined)
  }
  function choose(bot: DemoAgent) {
    if (!trigger || mentions.length >= 5) return
    const tag = `@${bot.name}`
    const next =
      text.slice(0, trigger.start) + tag + " " + text.slice(trigger.end)
    setMentions([
      ...reconcileMentions(text, next, mentions),
      { botId: bot.id, start: trigger.start, end: trigger.start + tag.length },
    ])
    setText(next)
    setCaret(trigger.start + tag.length + 1)
    setDismissed(key)
    requestAnimationFrame(() => {
      input.current?.focus()
      input.current?.setSelectionRange(
        trigger.start + tag.length + 1,
        trigger.start + tag.length + 1
      )
    })
  }
  function submit() {
    if (disabled || !text.trim()) return
    onSend(text, mentions)
    setText("")
    setMentions([])
    setCaret(0)
    setDismissed(undefined)
  }
  return (
    <div className={`dark ${styles.demoComposer}`}>
      {open && (
        <div className={styles.mentionMenu}>
          <div className={styles.mentionMenuHeading}>
            Your teammates · across all chats
          </div>
          <div
            role="listbox"
            id={listId}
            aria-label="Mention a teammate"
            className={styles.mentionOptions}
          >
            {mentions.length >= 5 ? (
              <p>Tag up to five teammates in one message.</p>
            ) : matches.length ? (
              matches.map((bot, index) => (
                <button
                  type="button"
                  role="option"
                  id={`${listId}-${bot.id}`}
                  key={bot.id}
                  aria-selected={index === selected}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(bot)}
                >
                  <DemoAvatar agent={{ ...bot, unread: false }} size={28} />
                  <span>
                    <strong>{bot.name}</strong>
                    <small>{bot.description}</small>
                  </span>
                </button>
              ))
            ) : (
              <p>No teammates found.</p>
            )}
          </div>
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className={styles.mentionComposerForm}
      >
        <button
          type="button"
          aria-label="Mention a teammate"
          className={styles.mentionTrigger}
          disabled={disabled}
          onClick={() => {
            const position = input.current?.selectionStart ?? text.length
            const prefix =
              position > 0 && !/\s/.test(text[position - 1]) ? " @" : "@"
            update(
              text.slice(0, position) + prefix + text.slice(position),
              position + prefix.length
            )
            input.current?.focus()
          }}
        >
          <AtSignIcon size={17} />
        </button>
        <textarea
          ref={input}
          aria-label={`Message ${name}`}
          placeholder={`Message ${name}…`}
          value={text || demoDraft}
          maxLength={2000}
          rows={1}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          aria-activedescendant={
            open && matches[selected]
              ? `${listId}-${matches[selected].id}`
              : undefined
          }
          onChange={(event) =>
            update(
              event.currentTarget.value,
              event.currentTarget.selectionStart
            )
          }
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (open && event.key === "Escape") {
              event.preventDefault()
              setDismissed(key)
              return
            }
            if (open && matches.length && mentions.length < 5) {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault()
                const index =
                  (selected +
                    (event.key === "ArrowDown" ? 1 : matches.length - 1)) %
                  matches.length
                setActive(index)
                document
                  .getElementById(`${listId}-${matches[index].id}`)
                  ?.scrollIntoView?.({ block: "nearest" })
                return
              }
              if (
                event.key === "Tab" ||
                (event.key === "Enter" && !event.shiftKey)
              ) {
                event.preventDefault()
                choose(matches[selected])
                return
              }
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
        />
        <button
          type="submit"
          aria-label="Send message"
          className={styles.mentionSend}
          disabled={disabled || !text.trim()}
        >
          <ArrowUpIcon size={16} />
        </button>
      </form>
    </div>
  )
}
