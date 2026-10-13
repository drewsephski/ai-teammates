"use client"

import {
  ArrowUp,
  ChevronDown,
  Menu,
  Monitor,
  Plus,
  Search,
  X,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { BotMark } from "./bot-mark"
import styles from "./chat-demo.module.css"

const conversations = [
  {
    name: "Chief",
    color: "#52b9a7",
    time: "Yesterday",
    preview: "booked the venue and sent the confirmation around.",
  },
  { name: "New agent", color: "#ffa72f", time: "1:08 PM", preview: "" },
  {
    name: "Inbox Manager",
    color: "#6662ed",
    time: "10:08 AM",
    preview: "sent. inbox at zero, 5 drafts parked for tomorrow.",
  },
  {
    name: "Account Manager",
    color: "#8c54fa",
    time: "8:08 AM",
    preview: "invite’s out to vicky. globex note held in drafts.",
  },
  {
    name: "Talent Scout",
    color: "#3885f6",
    time: "5:08 AM",
    preview: "3 intros drafted in your voice, held for your ok.",
  },
  {
    name: "Expense Manager",
    color: "#fc752a",
    time: "9:08 AM",
    preview: "report filed. 9 receipts, nothing outstanding.",
  },
  {
    name: "Offsite crew",
    color: "#e5b1cf",
    time: "Yesterday",
    preview: "that leaves the pipeline. i’d spin up a dedicated agent.",
  },
] as const

const sampleMessages = [
  {
    from: "you",
    text: "I need someone to help keep our sales pipeline moving.",
  },
  {
    from: "agent",
    text: "I can take that on. What should I know about your team?",
  },
  {
    from: "you",
    text: "Keep an eye on new leads, research each company, and draft a personal follow-up for me to review.",
  },
  {
    from: "agent",
    text: "Got it. I’ll help you research leads and prepare follow-ups. You’ll review each draft before it goes out.",
  },
] as const

export function BotChatDemo({ workspaceHref }: { workspaceHref: string }) {
  const router = useRouter()
  const [selectedName, setSelectedName] = useState<string>("New agent")
  const [query, setQuery] = useState("")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [computerOpen, setComputerOpen] = useState(false)
  const [visibleMessages, setVisibleMessages] = useState(1)
  const selected =
    conversations.find((conversation) => conversation.name === selectedName) ??
    conversations[1]
  const filtered = conversations.filter((conversation) =>
    `${conversation.name} ${conversation.preview}`
      .toLowerCase()
      .includes(query.toLowerCase())
  )

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    const timers = reducedMotion.matches
      ? [window.setTimeout(() => setVisibleMessages(sampleMessages.length), 0)]
      : [2, 3, 4].map((count) =>
          window.setTimeout(() => setVisibleMessages(count), (count - 1) * 1400)
        )
    return () => timers.forEach(window.clearTimeout)
  }, [])

  return (
    <div className={styles.frame} aria-label="Krafty example workspace">
      <aside
        id="bot-demo-chats"
        className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}
        aria-label="Example conversations"
      >
        <div className={styles.windowBar}>
          <div className={styles.trafficLights} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <Link
            href={workspaceHref}
            className={styles.iconButton}
            aria-label="Create a new agent"
          >
            <Plus size={16} />
          </Link>
          <button
            className={`${styles.iconButton} ${styles.mobileClose}`}
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close conversations"
          >
            <X size={16} />
          </button>
        </div>
        <label className={styles.search}>
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search example conversations"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className={styles.chatList}>
          {filtered.map((conversation) => (
            <button
              key={conversation.name}
              type="button"
              aria-pressed={conversation.name === selectedName}
              className={`${styles.chatRow} ${conversation.name === selectedName ? styles.selected : ""}`}
              onClick={() => {
                setSelectedName(conversation.name)
                setSidebarOpen(false)
              }}
            >
              <BotMark className={styles.avatar} color={conversation.color} />
              <span className={styles.rowContent}>
                <span className={styles.rowHeading}>
                  <span>{conversation.name}</span>
                  <time>{conversation.time}</time>
                </span>
                {conversation.preview && (
                  <span className={styles.preview}>{conversation.preview}</span>
                )}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className={styles.empty}>No conversations found.</p>
          )}
        </div>
      </aside>
      <div className={styles.chat}>
        <div className={styles.chatHeader}>
          <button
            className={`${styles.iconButton} ${styles.mobileMenu}`}
            type="button"
            aria-label="Show conversations"
            aria-expanded={sidebarOpen}
            aria-controls="bot-demo-chats"
            onClick={() => setSidebarOpen((open) => !open)}
          >
            <Menu size={17} />
          </button>
          <BotMark className={styles.headerAvatar} color={selected.color} />
          <span>{selected.name}</span>
          <button
            type="button"
            className={styles.computerButton}
            aria-label={
              computerOpen ? "Hide example computer" : "Show example computer"
            }
            aria-expanded={computerOpen}
            aria-controls="bot-demo-computer"
            onClick={() => setComputerOpen((open) => !open)}
          >
            <Monitor size={16} />
          </button>
        </div>
        <div className={styles.exampleLabel}>Example conversation</div>
        <div className={styles.conversation}>
          {computerOpen ? (
            <div id="bot-demo-computer" className={styles.computer}>
              <div className={styles.browserBar}>
                <span />
                <span />
                <span />
                <span className={styles.browserAddress}>
                  Your connected tools
                </span>
              </div>
              <div className={styles.computerContent}>
                <Monitor size={32} />
                <h3>A workspace for your agent</h3>
                <p>Connect your tools and give Krafty a task in the app.</p>
                <Link href={workspaceHref}>
                  Open Krafty <ArrowUp size={14} />
                </Link>
              </div>
              <p className={styles.computerCaption}>
                Illustrative computer preview
              </p>
            </div>
          ) : selected.name === "New agent" ? (
            sampleMessages.slice(0, visibleMessages).map((message, index) => (
              <div
                key={index}
                className={`${styles.message} ${message.from === "you" ? styles.userMessage : styles.agentMessage}`}
              >
                <span className={styles.messageAuthor}>
                  {message.from === "you" ? "You" : "Krafty"}
                </span>
                <p>{message.text}</p>
              </div>
            ))
          ) : (
            <div className={`${styles.message} ${styles.agentMessage}`}>
              <span className={styles.messageAuthor}>{selected.name}</span>
              <p>{selected.preview}</p>
            </div>
          )}
        </div>
        <div className={styles.composerArea}>
          <form
            className={styles.composer}
            action={workspaceHref}
            onSubmit={(event) => {
              event.preventDefault()
              router.push(workspaceHref)
            }}
          >
            <Link
              href={workspaceHref}
              className={styles.iconButton}
              aria-label="Add a task in Krafty"
            >
              <Plus size={19} />
            </Link>
            <input
              aria-label="Task for your Krafty agent"
              placeholder={`Message ${selected.name}…`}
            />
            <button
              type="submit"
              className={styles.send}
              aria-label="Continue in the Krafty app"
            >
              <ArrowUp size={17} />
            </button>
          </form>
          <div className={styles.identity}>
            <span className={styles.userAvatar}>Y</span>
            <span>You</span>
            <ChevronDown size={12} />
            <span className={styles.appHint}>
              Continue in Krafty to start a task
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
