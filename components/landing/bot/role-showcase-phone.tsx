"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { BotMark } from "./bot-mark"
import { roleScenarios, roles, roleStyle, type BotRole, type RoleEntry } from "./role-showcase-data"
import styles from "./role-showcase.module.css"

const cursorGlyphs = {
  back: "\ueab5",
  desktop: "\uea7a",
  plus: "\uea60",
  mic: "\uec12",
  clock: "\uedc0",
  close: "\ued82",
}

function CursorIcon({
  name,
  size,
}: {
  name: keyof typeof cursorGlyphs
  size: number
}) {
  return (
    <span
      aria-hidden="true"
      className={styles.cursorIcon}
      style={{ fontSize: size }}
    >
      {cursorGlyphs[name]}
    </span>
  )
}

function SlackMark() {
  return (
    <svg
      className={styles.slackMark}
      viewBox="0 0 2448 2453"
      aria-hidden="true"
    >
      <g fillRule="evenodd" clipRule="evenodd">
        <path
          fill="#36c5f0"
          d="m897.4 0c-135.3.1-244.8 109.9-244.7 245.2-.1 135.3 109.5 245.1 244.8 245.2h244.8v-245.1c.1-135.3-109.5-245.1-244.9-245.3.1 0 .1 0 0 0m0 654h-652.6c-135.3.1-244.9 109.9-244.8 245.2-.2 135.3 109.4 245.1 244.7 245.3h652.7c135.3-.1 244.9-109.9 244.8-245.2.1-135.4-109.4-245.2-244.8-245.3z"
        />
        <path
          fill="#2eb67d"
          d="m2447.6 899.2c.1-135.3-109.5-245.1-244.8-245.2-135.3.1-244.9 109.9-244.8 245.2v245.3h244.8c135.3-.1 244.9-109.9 244.8-245.3zm-652.7 0v-654c.1-135.2-109.4-245-244.7-245.2-135.3.1-244.9 109.9-244.8 245.2v654c-.2 135.3 109.4 245.1 244.7 245.3 135.3-.1 244.9-109.9 244.8-245.3z"
        />
        <path
          fill="#ecb22e"
          d="m1550.1 2452.5c135.3-.1 244.9-109.9 244.8-245.2.1-135.3-109.5-245.1-244.8-245.2h-244.8v245.2c-.1 135.2 109.5 245 244.8 245.2zm0-654.1h652.7c135.3-.1 244.9-109.9 244.8-245.2.2-135.3-109.4-245.1-244.7-245.3h-652.7c-135.3.1-244.9-109.9-244.8 245.2-.1 135.4 109.4 245.2 244.7 245.3z"
        />
        <path
          fill="#e01e5a"
          d="m0 1553.2c-.1 135.3 109.5 245.1 244.8 245.2 135.3-.1 244.9-109.9 244.8-245.2v-245.2h-244.8c-135.3.1-244.9 109.9-244.8 245.2zm652.7 0v654c-.2 135.3 109.4 245.1 244.7 245.3 135.3-.1 244.9-109.9 244.8-245.2v-653.9c.2-135.3-109.4-245.1-244.7-245.3-135.4 0-244.9 109.8-244.8 245.1 0 0 0 .1 0 0"
        />
      </g>
    </svg>
  )
}

function Badge({ sent, label }: { sent: boolean; label: string }) {
  return (
    <span className={styles.toolStatus} data-success={sent || undefined}>
      <i aria-hidden="true" />
      {label}
    </span>
  )
}

function MiniDesktop({
  roleId,
  workspaceHref,
}: {
  roleId: string
  workspaceHref: string
}) {
  const wallpaper = [4, 3, 2][Object.keys(roleScenarios).indexOf(roleId) % 3]
  return (
    <Link
      className={styles.computerPreview}
      href={workspaceHref}
      aria-label="Open your bot's computer"
    >
      <span
        className={styles.desktopWallpaper}
        style={{
          backgroundImage: `url(/landing/bot/cloud-agents-${wallpaper}.webp)`,
        }}
      />
      <span className={styles.terminalWindow}>
        <span className={styles.windowChrome}>
          <i />
          <i />
          <i />
        </span>
        <span className={styles.terminalLines}>
          {[
            "$ npm run dev",
            "ready - started on 0.0.0.0:3000",
            "✓ compiled in 1.2s",
            "○ compiling /dashboard...",
            "✓ compiled in 340ms",
          ].map((line, index) => (
            <span key={line} style={{ opacity: index ? 0.25 : 0.4 }}>
              {line}
            </span>
          ))}
        </span>
      </span>
      <span className={styles.browserWindow}>
        <span className={styles.windowChrome}>
          <i />
          <i />
          <i />
        </span>
        <span className={styles.browserBody}>
          <span className={styles.browserSidebar}>
            {[70, 50, 60, 45].map((width, index) => (
              <i key={index} style={{ width: `${width}%` }} />
            ))}
          </span>
          <span className={styles.browserContent}>
            <span className={styles.metricRows}>
              {[0, 1].map((index) => (
                <span key={index}>
                  <i />
                  <i />
                  <i />
                </span>
              ))}
            </span>
            <span className={styles.graph}>
              {[25, 38, 30, 55, 42, 68, 58, 80, 72, 91].map((height, index) => (
                <i key={index} style={{ height: `${height}%` }} />
              ))}
            </span>
            <span className={styles.tableRows}>
              {[72, 58, 81].map((width, index) => (
                <span key={index}>
                  <i style={{ width: `${width}%` }} />
                  <i />
                </span>
              ))}
            </span>
          </span>
        </span>
      </span>
    </Link>
  )
}

function OutboundCard({
  entry,
  workspaceHref,
}: {
  entry: Extract<RoleEntry, { kind: "outbound-message" }>
  workspaceHref: string
}) {
  const fields =
    entry.channel === "email"
      ? [
          ["From", entry.from],
          ["To", entry.to],
          ["Subject", entry.subject],
        ]
      : [
          ["Workspace", entry.workspace],
          ["To", entry.to],
          ["Thread", entry.thread],
        ]
  return (
    <div className={styles.toolCard}>
      <div className={styles.toolHeader}>
        {entry.channel === "slack" && <SlackMark />}
        <strong>
          {entry.channel === "slack" ? "Slack message" : "New email"}
        </strong>
        <Badge
          sent={entry.status === "sent"}
          label={entry.status === "sent" ? "Sent" : "Ready to send"}
        />
      </div>
      <dl className={styles.messagePanel}>
        {fields.map(([label, value]) => (
          <div className={styles.messageRow} key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div className={styles.cardBody}>
          {entry.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </dl>
      {entry.status === "ready" && (
        <div className={styles.cardActions}>
          <Link href={workspaceHref}>Send email</Link>
          <Link href={workspaceHref}>Discard</Link>
        </div>
      )}
    </div>
  )
}

function MessageText({ text }: { text: string }) {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/)
    .map((part, index) =>
      part.startsWith("**") ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : part.startsWith("`") ? (
        <code key={index}>{part.slice(1, -1)}</code>
      ) : (
        <span key={index}>{part}</span>
      )
    )
}

function TranscriptEntry({
  entry,
  role,
  workspaceHref,
}: {
  entry: RoleEntry
  role: BotRole
  workspaceHref: string
}) {
  if (entry.kind === "message")
    return (
      <div className={styles.userRow}>
        <p className={styles.humanMessage}>{entry.content}</p>
      </div>
    )
  if (entry.kind === "send-message")
    return (
      <p className={styles.botMessage}>
        <MessageText text={entry.message.content} />
      </p>
    )
  if (entry.kind === "outbound-message")
    return <OutboundCard entry={entry} workspaceHref={workspaceHref} />
  if (entry.kind === "computer-use")
    return (
      <div className={styles.toolCard}>
        <div className={styles.toolHeader}>
          <Link href={workspaceHref}>Computer</Link>
          <Badge sent label="Done" />
        </div>
        <p className={styles.computerInstruction}>{entry.instruction}</p>
        <MiniDesktop roleId={role.id} workspaceHref={workspaceHref} />
      </div>
    )
  if (entry.event.type === "created-routine")
    return (
      <div className={styles.routine}>
        <span>Created routine</span>
        <Link href={workspaceHref}>
          <CursorIcon name="clock" size={12} aria-hidden="true" />
          {entry.event.name}
        </Link>
      </div>
    )
  return (
    <div className={styles.sharedContext}>
      <span>
        <BotMark
          color={entry.event.source.name === "Chief" ? "#ed712e" : "#3c82f6"}
        />
        {entry.event.source.name}
      </span>{" "}
      shared <em>{entry.event.summary}</em>
    </div>
  )
}

function timestamp(offset: number) {
  // Keep the original captured demo's clock stable across server and client renders.
  const capturedNow = Date.UTC(2026, 9, 13, 13, 8)
  const date = new Date(capturedNow + offset)
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  })
  const daysAgo = Math.round(
    (Date.UTC(2026, 9, 13) -
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())) /
      86400000
  )
  if (daysAgo <= 0) return time
  if (daysAgo === 1) return `Yesterday ${time}`
  const dateLabel = date.toLocaleDateString(
    "en-US",
    daysAgo < 7
      ? { weekday: "long", timeZone: "UTC" }
      : { month: "short", day: "numeric", timeZone: "UTC" }
  )
  return `${dateLabel} ${time}`
}

function PhoneChatList({ workspaceHref, onOpen }: { workspaceHref: string; onOpen: (role: BotRole) => void }) {
  const orderedRoles = Object.keys(roleScenarios).map((id) => roles.find((role) => role.id === id)!).filter(Boolean)
  const pinnedRoles = orderedRoles.filter((role) => roleScenarios[role.id].isPinned)
  return <div className={styles.chatList} aria-label="Krafty Bot chats">
    <div className={styles.topFade} />
    <header className={styles.listHeader}>
      <Link href={workspaceHref} className={styles.glassControl} aria-label="Sam Reyes — profile">SR</Link>
      <span>Krafty Bot</span>
      <Link href={workspaceHref} className={styles.glassControl} aria-label="New agent"><CursorIcon name="plus" size={13} /></Link>
    </header>
    <div className={styles.chatListScroll}>
      <div className={styles.pinnedRoles}>{pinnedRoles.map((role) => <button key={role.id} type="button" onClick={() => onOpen(role)}><BotMark color={role.color} /><span>{roleScenarios[role.id].name}</span></button>)}</div>
      {orderedRoles.map((role) => { const scenario = roleScenarios[role.id]; return <button type="button" key={role.id} className={styles.chatListRow} onClick={() => onOpen(role)} aria-label={`Open ${scenario.name} chat`}>
        <BotMark className={styles.listAvatar} color={role.color} state={scenario.isRunning ? "working" : "idle"} />
        <span className={styles.listRowBody}><span className={styles.listRowHeading}><span>{scenario.name}</span><time>{timestamp(scenario.lastActivityAt).split(" ").slice(-2).join(" ")}</time></span><span className={styles.listRowPreview}><span>{scenario.lastMessage}</span>{scenario.unreadCount > 0 ? <span className={styles.unreadCount}>{scenario.unreadCount}</span> : scenario.hasUnread ? <i className={styles.unreadDot} /> : null}</span></span>
      </button> })}
    </div>
  </div>
}

function PhoneScreenSheet({ role, workspaceHref, onClose }: { role: BotRole; workspaceHref: string; onClose: () => void }) {
  const scenario = roleScenarios[role.id]
  return <div className={styles.screenOverlay}>
    <button type="button" className={styles.screenScrim} aria-label={`Close ${scenario.name}'s screen`} onClick={onClose} />
    <div className={styles.screenSheet} role="dialog" aria-label={`${scenario.name}'s screen`}>
      <div className={styles.sheetHandle}><span /></div>
      <header className={styles.sheetHeader}><span>{scenario.name}&apos;s screen</span><button type="button" className={styles.glassControl} aria-label="Close screen" onClick={onClose}><CursorIcon name="close" size={13} /></button></header>
      <div className={styles.sheetDesktop}><MiniDesktop roleId={role.id} workspaceHref={workspaceHref} /></div>
    </div>
  </div>
}

export function RolePhone({
  role: initialRole,
  workspaceHref,
}: {
  role: BotRole
  workspaceHref: string
}) {
  const [role, setRole] = useState(initialRole)
  const [view, setView] = useState<"chat" | "list">("chat")
  const [showScreen, setShowScreen] = useState(false)
  const scenario = roleScenarios[role.id]
  const scrollRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  useEffect(() => {
    const element = scrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [role.id, view])
  return (
    <div className={styles.phoneStage}>
      <div className={styles.phone}>
        <span className={styles.powerButton} />
        <span className={styles.silentButton} />
        <span className={styles.volumeUp} />
        <span className={styles.volumeDown} />
        <div className={styles.phoneFrame}>
          <div className={styles.phoneScreen}>
            <div className={styles.phoneStatus}>
              <span className={styles.dynamicIsland} />
            </div>
            <div
              className={styles.conversation}
              style={roleStyle(role)}
              aria-label={`${role.name} example conversation`}
            >
              {view === "list" ? <PhoneChatList workspaceHref={workspaceHref} onOpen={(nextRole) => { setRole(nextRole); setView("chat") }} /> : <>
              <header className={styles.chatHeader}>
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className={styles.glassControl}
                  aria-label="Back to chats"
                >
                  <CursorIcon name="back" size={15} aria-hidden="true" />
                </button>
                <div className={styles.agentTitle}>
                  <BotMark className={styles.headerAvatar} color={role.color} />
                  <span>{scenario.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowScreen(true)}
                  className={styles.glassControl}
                  aria-label={`Open ${scenario.name}'s screen`}
                >
                  <CursorIcon name="desktop" size={15} aria-hidden="true" />
                </button>
              </header>
              <div className={styles.topFade} />
              <div className={styles.bottomFade} />
              <div
                className={styles.messages}
                ref={scrollRef}
                key={role.name}
                onScroll={() => {
                  const element = scrollRef.current
                  if (element)
                    setAtBottom(
                      element.scrollHeight -
                        element.scrollTop -
                        element.clientHeight <
                        80
                    )
                }}
              >
                {scenario.transcript.map((entry, index) => {
                  const previous = scenario.transcript[index - 1]
                  const showTime =
                    !previous ||
                    entry.timestampMs - previous.timestampMs >= 2700000
                  const isUser = entry.kind === "message"
                  const previousUser = previous?.kind === "message"
                  const changedRole =
                    previous &&
                    (isUser !== previousUser ||
                      (entry.kind === "system") !==
                        (previous.kind === "system"))
                  return (
                    <div
                      key={entry.id}
                      className={styles.entry}
                      data-break={changedRole || showTime || undefined}
                      style={{
                        animationDelay: `${Math.min(index * 45, 320)}ms`,
                      }}
                    >
                      {showTime && (
                        <p className={styles.timestamp}>
                          {timestamp(entry.timestampMs)}
                        </p>
                      )}
                      <TranscriptEntry
                        entry={entry}
                        role={role}
                        workspaceHref={workspaceHref}
                      />
                    </div>
                  )
                })}
              </div>
              {!atBottom && (
                <button
                  className={styles.toLatest}
                  type="button"
                  aria-label="Scroll to latest"
                  onClick={() =>
                    scrollRef.current?.scrollTo({
                      top: scrollRef.current.scrollHeight,
                      behavior: "smooth",
                    })
                  }
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M7.00342 9.62646C6.86377 9.62646 6.74023 9.57275 6.63818 9.4707L2.48096 5.2168C2.38965 5.12012 2.33594 5.00195 2.33594 4.86768C2.33594 4.58838 2.54541 4.37354 2.82471 4.37354C2.96436 4.37354 3.08789 4.42725 3.17383 4.51318L7.00342 8.42334L10.8276 4.51318C10.9189 4.42725 11.0425 4.37354 11.1768 4.37354C11.4561 4.37354 11.6655 4.58838 11.6655 4.86768C11.6655 5.00195 11.6118 5.12012 11.5205 5.21143L7.36328 9.4707C7.27197 9.57275 7.1377 9.62646 7.00342 9.62646Z" />
                  </svg>
                </button>
              )}
              <div className={styles.composerRow}>
                <Link
                  href={workspaceHref}
                  className={styles.addContext}
                  aria-label="Add context"
                >
                  <CursorIcon name="plus" size={16} aria-hidden="true" />
                </Link>
                <Link
                  href={workspaceHref}
                  className={styles.composer}
                  aria-label={`Message ${scenario.name}`}
                >
                  <span>Message {scenario.name.split(" ")[0]}...</span>
                  <span className={styles.sendIcon}>
                    <CursorIcon name="mic" size={14} aria-hidden="true" />
                  </span>
                </Link>
              </div>
              </>}
              {showScreen && <PhoneScreenSheet role={role} workspaceHref={workspaceHref} onClose={() => setShowScreen(false)} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

