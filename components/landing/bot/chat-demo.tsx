"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { BotMark } from "./bot-mark"
import { demoAgents, type DemoAgent, type DemoEntry } from "./chat-demo-data"
import { DemoDesktop } from "./chat-demo-screen"
import { useHeroDemo, type DemoScreen } from "./chat-demo-timeline"
import styles from "./chat-demo.module.css"

const icons = {
  plus: "EA60",
  search: "EA6D",
  monitor: "EA7A",
  mic: "EC12",
  arrow: "EAA1",
  clock: "EDC0",
  close: "ED82",
  gear: "EAF8",
  back: "EAB5",
  loading: "EDCA",
} as const
function Icon({
  name,
  size = 14,
}: {
  name: keyof typeof icons
  size?: number
}) {
  return (
    <span
      className={styles.icon}
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size }}
    >
      {String.fromCodePoint(parseInt(icons[name], 16))}
    </span>
  )
}
function Avatar({
  agent,
  size = 32,
  working = false,
}: {
  agent: DemoAgent
  size?: number
  working?: boolean
}) {
  if (agent.group) {
    const memberSize = Math.round(size * 0.56)
    return (
      <span
        className={styles.groupAvatar}
        style={{ width: size, height: size }}
      >
        {[demoAgents[0], demoAgents[2], demoAgents[3]].map((member, index) => (
          <span
            key={member.id}
            style={{
              width: memberSize,
              height: memberSize,
              left:
                index === 0
                  ? (size - memberSize) / 2
                  : index === 1
                    ? 0
                    : size - memberSize,
              top: index === 0 ? 0 : size - memberSize,
              zIndex: index + 1,
            }}
          >
            <BotMark color={member.color} />
          </span>
        ))}
      </span>
    )
  }
  return (
    <span className={styles.avatar} style={{ width: size, height: size }}>
      <BotMark
        color={agent.color}
        shape={agent.shape}
        state={working ? "working" : "idle"}
      />
      {agent.unread && <span className={styles.unread} />}
    </span>
  )
}
function RichText({
  text,
  onAgent,
}: {
  text: string
  onAgent: (name: string) => void
}) {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`|@\[[^\]]+\])/g)
    .map((part, index) =>
      part.startsWith("**") ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : part.startsWith("`") ? (
        <code key={index}>{part.slice(1, -1)}</code>
      ) : part.startsWith("@[") ? (
        <button
          type="button"
          key={index}
          className={styles.mention}
          onClick={() => onAgent(part.slice(2, -1))}
        >
          <Avatar
            agent={
              demoAgents.find((agent) => agent.name === part.slice(2, -1)) ??
              demoAgents[0]
            }
            size={14}
          />
          {part.slice(2, -1)}
        </button>
      ) : (
        <span key={index}>{part}</span>
      )
    )
}

function Entry({
  entry,
  screen,
  status,
  onScreen,
  onAgent,
}: {
  entry: DemoEntry
  screen: DemoScreen
  status: "action-needed" | "handed-over" | "working" | "done"
  onScreen: () => void
  onAgent: (name: string) => void
}) {
  if (entry.kind === "system")
    return (
      <div className={styles.system}>
        {entry.text}
        {entry.targets ? (
          entry.targets.map((name, index) => (
            <span key={name}>
              {index > 0 && <span className={styles.and}>and</span>}
              <button type="button" onClick={() => onAgent(name)}>
                <Avatar
                  agent={
                    demoAgents.find((agent) => agent.name === name) ??
                    demoAgents[0]
                  }
                  size={12}
                />
                {name}
              </button>
            </span>
          ))
        ) : entry.text.startsWith("Created routine") ? (
          <Icon name="clock" size={15} />
        ) : null}
      </div>
    )
  if (entry.kind === "computer")
    return (
      <div className={styles.card}>
        <div className={styles.cardTop}>
          <button className={styles.cardTitle} type="button" onClick={onScreen}>
            Computer
          </button>
          <span className={styles.badge} data-status={status}>
            <span
              className={
                status === "action-needed" || status === "working"
                  ? styles.spinner
                  : styles.badgeDot
              }
            >
              {status === "action-needed" || status === "working" ? (
                <Icon name="loading" size={12} />
              ) : null}
            </span>
            {
              {
                "action-needed": "Action needed",
                "handed-over": "You're in control",
                working: "Working",
                done: "Done",
              }[status]
            }
          </span>
        </div>
        <p>{entry.text}</p>
        <div className={styles.cardScreen}>
          <DemoDesktop screen={screen} onExpand={onScreen} />
        </div>
        {status !== "done" && status !== "working" && (
          <div className={styles.cardActions}>
            <button
              type="button"
              className={styles.primaryAction}
              data-demo-target="computer-take-over"
              onClick={onScreen}
            >
              Take over
            </button>
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={onScreen}
            >
              I’m done
            </button>
          </div>
        )}
      </div>
    )
  const user = entry.kind === "user"
  return (
    <div className={`${styles.messageRow} ${user ? styles.userRow : ""}`}>
      <div
        className={`${styles.messageWrapper} ${user ? styles.userWrapper : ""} ${entry.reactions ? styles.withReaction : ""}`}
      >
        {entry.author && <p className={styles.author}>{entry.author}</p>}
        <div
          className={`${styles.message} ${user ? styles.userMessage : styles.agentMessage}`}
          style={
            entry.reactions
              ? {
                  maskImage: `radial-gradient(circle at ${user ? "calc(100% - 20px)" : "20px"} calc(100% + 4px), transparent 11.5px, #000 12px)`,
                }
              : undefined
          }
        >
          <RichText text={entry.text} onAgent={onAgent} />
        </div>
        {entry.reactions && (
          <span
            className={`${styles.reactions} ${user ? styles.userReactions : ""}`}
          >
            {entry.reactions.map((reaction) => (
              <span key={reaction}>{reaction}</span>
            ))}
          </span>
        )}
      </div>
    </div>
  )
}

export function BotChatDemo({ workspaceHref }: { workspaceHref: string }) {
  const router = useRouter()
  const frame = useRef<HTMLDivElement>(null)
  const transcript = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const { finish, ...hero } = useHeroDemo(frame)
  const [selectedId, setSelectedId] = useState("sales-outbound")
  const [query, setQuery] = useState("")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [computerOpen, setComputerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notifications, setNotifications] = useState(true)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [composer, setComposer] = useState("")
  const selected =
    demoAgents.find((agent) => agent.id === selectedId) ?? demoAgents[1]
  const isHero = selectedId === "sales-outbound"
  const selectedName = isHero ? hero.name : selected.name
  const entries = isHero ? hero.entries : selected.entries
  const screen = isHero
    ? hero.screen
    : {
        view: "settled" as const,
        emailChars: 13,
        passwordChars: 9,
        focus: null,
      }
  const showOverlay = overlayOpen || (isHero && hero.overlay)
  const routines =
    isHero && hero.complete
      ? [{ name: "Overnight outbound", trigger: "Sundays at 11:00 PM" }]
      : selected.routines
  const lastHero = [...hero.entries]
    .reverse()
    .find((entry) => entry.kind === "agent" || entry.kind === "user")
  const openAgent = (name: string) => {
    finish()
    const agent = demoAgents.find((candidate) => candidate.name === name)
    if (agent) {
      setSelectedId(agent.id)
      setSidebarOpen(false)
      atBottom.current = true
    }
  }
  useEffect(() => {
    const element = transcript.current
    if (!element || !atBottom.current) return
    const animation = requestAnimationFrame(() =>
      element.scrollTo({
        top: element.scrollHeight,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      })
    )
    return () => cancelAnimationFrame(animation)
  }, [entries, hero.pending, selectedId])
  useEffect(() => {
    if (!showOverlay) return
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        finish()
        setOverlayOpen(false)
      }
    }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [showOverlay, finish])

  return (
    <div
      ref={frame}
      className={styles.frame}
      aria-label="Krafty example workspace"
      style={{ "--agent-color": selected.color } as CSSProperties}
    >
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
            aria-label="New agent"
          >
            <Icon name="plus" />
          </Link>
          <button
            className={`${styles.iconButton} ${styles.mobileClose}`}
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close conversations"
          >
            <Icon name="close" />
          </button>
        </div>
        <label className={styles.search}>
          <Icon name="search" />
          <input
            type="search"
            aria-label="Search chats"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className={styles.chatList}>
          {demoAgents
            .filter((agent) =>
              `${agent.name} ${agent.preview}`
                .toLowerCase()
                .includes(query.toLowerCase())
            )
            .map((agent) => {
              const currentHero = agent.id === "sales-outbound"
              const name = currentHero ? hero.name : agent.name
              const preview = currentHero
                ? hero.pending
                  ? "Typing…"
                  : (lastHero?.text.replace(/\*\*/g, "") ?? "")
                : agent.preview
              return (
                <button
                  key={agent.id}
                  type="button"
                  aria-pressed={agent.id === selectedId}
                  className={`${styles.chatRow} ${agent.id === selectedId ? styles.selected : ""}`}
                  onClick={() => {
                    finish()
                    setSelectedId(agent.id)
                    setSidebarOpen(false)
                    setSettingsOpen(false)
                    atBottom.current = true
                  }}
                >
                  <Avatar
                    agent={{
                      ...agent,
                      unread: agent.unread && agent.id !== selectedId,
                    }}
                    working={currentHero && !!hero.pending}
                  />
                  <span
                    className={styles.rowContent}
                    data-empty={!preview || undefined}
                  >
                    <span className={styles.rowHeading}>
                      <span key={name}>{name}</span>
                      <time>{agent.time}</time>
                    </span>
                    <span className={styles.preview}>
                      {preview || "\u00a0"}
                    </span>
                  </span>
                </button>
              )
            })}
          {!demoAgents.some((agent) =>
            `${agent.name} ${agent.preview}`
              .toLowerCase()
              .includes(query.toLowerCase())
          ) && <p className={styles.empty}>No chats found.</p>}
        </div>
        <div className={styles.identity}>
          <span>DS</span>Drew Sepeczi
        </div>
      </aside>
      <div className={styles.chat}>
        <header className={styles.chatHeader}>
          <button
            className={`${styles.iconButton} ${styles.mobileMenu}`}
            type="button"
            aria-label="Show conversations"
            aria-expanded={sidebarOpen}
            aria-controls="bot-demo-chats"
            onClick={() => setSidebarOpen((open) => !open)}
          >
            <Icon name="back" />
          </button>
          <button
            type="button"
            className={styles.agentTitle}
            onClick={() => {
              if (!selected.group) setComputerOpen(true)
            }}
            aria-label={`Open ${selectedName}'s computer`}
          >
            <Avatar
              agent={{ ...selected, unread: false }}
              size={18}
              working={isHero && !!hero.pending}
            />
            <span key={selectedName}>{selectedName}</span>
          </button>
          <span className={styles.exampleLabel}>Example</span>
          {!selected.group && (
            <button
              type="button"
              className={styles.iconButton}
              aria-label={computerOpen ? "Hide computer" : "Open computer"}
              aria-pressed={computerOpen}
              onClick={() => setComputerOpen((open) => !open)}
            >
              <Icon name="monitor" />
            </button>
          )}
        </header>
        <div
          ref={transcript}
          className={styles.conversation}
          onScroll={(event) => {
            const node = event.currentTarget
            atBottom.current =
              node.scrollHeight - node.scrollTop - node.clientHeight < 80
          }}
        >
          <div className={styles.entries}>
            {entries.map((entry, index) => (
              <div
                key={`${selectedId}-${index}`}
                className={`${styles.entry} ${index > 0 && entry.kind !== entries[index - 1].kind ? styles.roleChange : ""}`}
              >
                {index === 0 && (
                  <div className={styles.timestamp}>
                    {isHero
                      ? "Today 1:08 PM"
                      : selected.time === "Yesterday"
                        ? "Yesterday 3:08 PM"
                        : `Today ${selected.time}`}
                  </div>
                )}
                <Entry
                  entry={entry}
                  screen={screen}
                  status={hero.computerStatus}
                  onScreen={() => {
                    finish()
                    setOverlayOpen(true)
                  }}
                  onAgent={openAgent}
                />
              </div>
            ))}
            {isHero && hero.pending && (
              <div className={styles.pending}>
                <BotMark
                  className={styles.pendingAvatar}
                  color={selected.color}
                  state={hero.pending === "Spawning" ? "spawning" : "thinking"}
                />
                <span key={hero.pending}>{hero.pending}</span>
              </div>
            )}
          </div>
        </div>
        <form
          className={styles.composerArea}
          action={workspaceHref}
          onSubmit={(event) => {
            event.preventDefault()
            router.push(workspaceHref)
          }}
        >
          <div className={styles.composerFade} aria-hidden="true" />
          <div className={styles.composer}>
            <Link
              href={workspaceHref}
              className={styles.addContext}
              aria-label="Add context in Krafty"
            >
              <Icon name="plus" />
            </Link>
            <input
              aria-label={`Message ${selectedName}`}
              placeholder={`Message ${selectedName}`}
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
            />
            <button
              type="submit"
              className={styles.send}
              aria-label={
                composer ? "Send in Krafty" : "Voice message in Krafty"
              }
            >
              <Icon name={composer ? "arrow" : "mic"} />
            </button>
          </div>
        </form>
      </div>
      {computerOpen && !selected.group && (
        <aside
          className={styles.computerPane}
          aria-label={`${selectedName}'s computer`}
        >
          <header className={styles.paneHeader}>
            {settingsOpen && (
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Back to computer"
                onClick={() => setSettingsOpen(false)}
              >
                <Icon name="back" size={15} />
              </button>
            )}
            <span>{settingsOpen ? "Settings" : ""}</span>
            {!settingsOpen && (
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Agent settings"
                onClick={() => setSettingsOpen(true)}
              >
                <Icon name="gear" size={15} />
              </button>
            )}
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Close computer"
              onClick={() => setComputerOpen(false)}
            >
              <Icon name="close" />
            </button>
          </header>
          <div className={styles.paneContent}>
            {settingsOpen ? (
              <>
                <div className={styles.settingsAvatar}>
                  <Avatar agent={{ ...selected, unread: false }} size={64} />
                </div>
                {[
                  { label: "Name", value: selectedName },
                  { label: "Title (optional)", value: selected.title },
                  { label: "Description", value: selected.description },
                ].map((field) => (
                  <div key={field.label} className={styles.settingsField}>
                    <span>{field.label}</span>
                    <div>{field.value || "Add a title"}</div>
                  </div>
                ))}
                <div className={styles.notificationSetting}>
                  <div>
                    Notifications
                    <p>Get notified when this agent finishes or needs input</p>
                  </div>
                  <button
                    className={styles.toggle}
                    role="switch"
                    aria-checked={notifications}
                    aria-label="Notifications"
                    type="button"
                    onClick={() => setNotifications((on) => !on)}
                  >
                    <span />
                  </button>
                </div>
              </>
            ) : (
              <>
                <DemoDesktop
                  screen={screen}
                  onExpand={() => setOverlayOpen(true)}
                />
                <p className={styles.screenCaption}>{selectedName}’s screen</p>
                <div className={styles.routines}>
                  <span>Routines</span>
                  {routines.length ? (
                    routines.map((routine) => (
                      <div key={routine.name}>
                        <Icon name="clock" size={15} />
                        <p>
                          {routine.name}
                          <span>{routine.trigger}</span>
                        </p>
                      </div>
                    ))
                  ) : (
                    <p>
                      Nothing scheduled yet. Ask {selectedName} to do something
                      every morning and it shows up here.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </aside>
      )}
      {showOverlay && (
        <div className={styles.screenLayer}>
          <button
            className={styles.scrim}
            type="button"
            aria-label="Close example computer"
            onClick={() => {
              finish()
              setOverlayOpen(false)
            }}
          />
          <div className={styles.screenShell}>
            <div className={styles.screenBanner}>
              <span>
                Sign in to Salesforce so I can see the accounts you own.
              </span>
              <button
                type="button"
                data-demo-target="screen-done"
                onClick={() => {
                  finish()
                  setOverlayOpen(false)
                }}
              >
                I’m done, continue
              </button>
            </div>
            <div
              className={styles.screenFrame}
              role="dialog"
              aria-label={`${selectedName}'s example screen`}
            >
              <DemoDesktop screen={screen} expanded onSignIn={finish} />
            </div>
          </div>
        </div>
      )}
      {hero.cursor.visible && (
        <div
          className={styles.demoCursor}
          aria-hidden="true"
          data-clicking={hero.cursor.clicking || undefined}
          style={{
            transform: `translate(${hero.cursor.x}px,${hero.cursor.y}px)`,
            transitionDuration: `${hero.cursor.duration}ms`,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M14.4775 2.375C15.1508 2.37522 15.5719 3.10428 15.2353 3.6875L8.63861 15.1143C8.19099 15.8892 7.00618 15.5716 7.00579 14.6768V7.56348L0.845638 4.00781C0.0708241 3.56015 0.388339 2.37535 1.28314 2.375H14.4775ZM7.69329 6.51758C8.04109 6.7186 8.25579 7.09044 8.25579 7.49219V13.2764L13.8271 3.625H2.68353L7.69329 6.51758Z"
              fill="white"
            />
            <path
              d="M7.69329 6.51758C8.04109 6.7186 8.25579 7.09044 8.25579 7.49219V13.2764L13.8271 3.625H2.68353L7.69329 6.51758Z"
              fill="#1a1a1a"
            />
          </svg>
          <span>You</span>
        </div>
      )}
    </div>
  )
}
