"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { BotMark } from "./bot-mark"
import {
  roleScenarios,
  roles,
  roleStyle,
  type BotRole,
} from "./role-showcase-data"
import { CursorIcon, MiniDesktop, TranscriptEntry } from "./role-showcase-cards"
import styles from "./role-showcase.module.css"

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

function PhoneChatList({
  workspaceHref,
  onOpen,
}: {
  workspaceHref: string
  onOpen: (role: BotRole) => void
}) {
  const orderedRoles = Object.keys(roleScenarios)
    .map((id) => roles.find((role) => role.id === id)!)
    .filter(Boolean)
  const pinnedRoles = orderedRoles.filter(
    (role) => roleScenarios[role.id].isPinned
  )
  return (
    <div className={styles.chatList} aria-label="Krafty Bot chats">
      <div className={styles.topFade} />
      <header className={styles.listHeader}>
        <Link
          href={workspaceHref}
          className={styles.glassControl}
          aria-label="Drew Sepeczi — profile"
        >
          DS
        </Link>
        <span>Krafty Bot</span>
        <Link
          href={workspaceHref}
          className={styles.glassControl}
          aria-label="New agent"
        >
          <CursorIcon name="plus" size={13} />
        </Link>
      </header>
      <div className={styles.chatListScroll}>
        <div className={styles.pinnedRoles}>
          {pinnedRoles.map((role) => (
            <button key={role.id} type="button" onClick={() => onOpen(role)}>
              <BotMark color={role.color} />
              <span>{roleScenarios[role.id].name}</span>
            </button>
          ))}
        </div>
        {orderedRoles.map((role) => {
          const scenario = roleScenarios[role.id]
          return (
            <button
              type="button"
              key={role.id}
              className={styles.chatListRow}
              onClick={() => onOpen(role)}
              aria-label={`Open ${scenario.name} chat`}
            >
              <BotMark
                className={styles.listAvatar}
                color={role.color}
                state={scenario.isRunning ? "working" : "idle"}
              />
              <span className={styles.listRowBody}>
                <span className={styles.listRowHeading}>
                  <span>{scenario.name}</span>
                  <time>
                    {timestamp(scenario.lastActivityAt)
                      .split(" ")
                      .slice(-2)
                      .join(" ")}
                  </time>
                </span>
                <span className={styles.listRowPreview}>
                  <span>{scenario.lastMessage}</span>
                  {scenario.unreadCount > 0 ? (
                    <span className={styles.unreadCount}>
                      {scenario.unreadCount}
                    </span>
                  ) : scenario.hasUnread ? (
                    <i className={styles.unreadDot} />
                  ) : null}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PhoneScreenSheet({
  role,
  workspaceHref,
  onClose,
}: {
  role: BotRole
  workspaceHref: string
  onClose: () => void
}) {
  const scenario = roleScenarios[role.id]
  return (
    <div className={styles.screenOverlay}>
      <button
        type="button"
        className={styles.screenScrim}
        aria-label={`Close ${scenario.name}'s screen`}
        onClick={onClose}
      />
      <div
        className={styles.screenSheet}
        role="dialog"
        aria-label={`${scenario.name}'s screen`}
      >
        <div className={styles.sheetHandle}>
          <span />
        </div>
        <header className={styles.sheetHeader}>
          <span>{scenario.name}&apos;s screen</span>
          <button
            type="button"
            className={styles.glassControl}
            aria-label="Close screen"
            onClick={onClose}
          >
            <CursorIcon name="close" size={13} />
          </button>
        </header>
        <div className={styles.sheetDesktop}>
          <MiniDesktop roleId={role.id} workspaceHref={workspaceHref} />
        </div>
      </div>
    </div>
  )
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
              {view === "list" ? (
                <PhoneChatList
                  workspaceHref={workspaceHref}
                  onOpen={(nextRole) => {
                    setRole(nextRole)
                    setView("chat")
                  }}
                />
              ) : (
                <>
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
                      <BotMark
                        className={styles.headerAvatar}
                        color={role.color}
                      />
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
                </>
              )}
              {showScreen && (
                <PhoneScreenSheet
                  role={role}
                  workspaceHref={workspaceHref}
                  onClose={() => setShowScreen(false)}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
