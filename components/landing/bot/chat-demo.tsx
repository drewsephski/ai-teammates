"use client"

import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import Link from "next/link"
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { pendingDemoDecisions, useDemoInbox } from "./chat-demo-inbox"
import { DemoComposer } from "./chat-demo-composer"
import { useDemoInvocation } from "./chat-demo-invocation"
import { DemoResponse } from "./chat-demo-response"
import { DemoSetup } from "./chat-demo-setup"
import { DemoActivity } from "./chat-demo-activity"
import { demoAgents } from "./chat-demo-data"
import { DemoDesktop } from "./chat-demo-screen"
import { useHeroDemo } from "./chat-demo-timeline"
import { DemoComputerPane } from "./chat-demo-computer-pane"
import {
  DemoAvatar as Avatar,
  DemoEntryView as Entry,
  DemoIcon as Icon,
} from "./chat-demo-ui"
import styles from "./chat-demo.module.css"

export function BotChatDemo({ workspaceHref }: { workspaceHref: string }) {
  const frame = useRef<HTMLDivElement>(null)
  const transcript = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const [setupName, setSetupName] = useState("New bot")
  const {
    selectedId,
    selectChat,
    unread,
    decisions,
    replies,
    recordReply,
    recordMessage,
    recordDecision,
    setupWaiting,
    setupWaitingKind,
    reportSetupWaiting,
    receive,
  } = useDemoInbox()
  const { finish, ...hero } = useHeroDemo(frame, selectedId === "prospecting")
  const [query, setQuery] = useState("")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [computerOpen, setComputerOpen] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const invocation = useDemoInvocation(recordMessage)
  const mentionBots = demoAgents
    .filter((bot) => !bot.group)
    .map((bot) =>
      bot.id === "new-bot"
        ? { ...bot, name: setupName }
        : bot.id === "prospecting"
          ? { ...bot, name: "Prospecting" }
          : bot
    )
  const selected =
    demoAgents.find((agent) => agent.id === selectedId) ?? demoAgents[1]
  const isHero = selectedId === "prospecting"
  const isSetup = selectedId === "new-bot"
  const selectedName = isSetup ? setupName : isHero ? hero.name : selected.name
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
      ? [{ name: "Weekly prospecting", trigger: "Mondays at 8:00 AM" }]
      : selected.routines
  const heroApprovalCount = pendingDemoDecisions(
    "prospecting",
    hero.entries,
    decisions
  )
  const previousHeroApprovalCount = useRef(0)
  useEffect(() => {
    if (heroApprovalCount > previousHeroApprovalCount.current)
      receive("prospecting")
    previousHeroApprovalCount.current = heroApprovalCount
  }, [heroApprovalCount, receive])
  const lastHero = [...hero.entries]
    .reverse()
    .find((entry) => entry.kind === "agent" || entry.kind === "user")
  const openAgent = (name: string) => {
    finish()
    const agent = demoAgents.find((candidate) => candidate.name === name)
    if (agent) {
      selectChat(agent.id)
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
    const element = transcript.current
    const content = element?.firstElementChild
    if (!element || !content) return
    const observer = new ResizeObserver(() => {
      if (atBottom.current)
        element.scrollTo({ top: element.scrollHeight, behavior: "auto" })
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [])
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
              `${agent.id === "new-bot" ? setupName : agent.id === "prospecting" ? "Prospecting" : agent.name} ${agent.preview}`
                .toLowerCase()
                .includes(query.toLowerCase())
            )
            .map((agent) => {
              const currentHero = agent.id === "prospecting"
              const currentSetup = agent.id === "new-bot"
              const name = currentSetup
                ? setupName
                : currentHero
                  ? "Prospecting"
                  : agent.name
              const latestReply = Object.values(replies)
                .filter((reply) => reply.chatId === agent.id)
                .at(-1)
              const preview =
                latestReply?.text ??
                (currentHero
                  ? hero.pending
                    ? "Typing…"
                    : (lastHero?.text.replace(/\*\*/g, "") ?? "")
                  : agent.preview)
              const waiting = currentSetup
                ? Number(setupWaiting)
                : currentHero
                  ? heroApprovalCount
                  : pendingDemoDecisions(agent.id, agent.entries, decisions)
              const awaiting = waiting > 0 && agent.id !== selectedId
              const needsResponse =
                currentSetup && setupWaiting && setupWaitingKind === "response"
              return (
                <button
                  key={agent.id}
                  type="button"
                  aria-pressed={agent.id === selectedId}
                  data-unread={unread[agent.id] || undefined}
                  data-waiting={awaiting || undefined}
                  aria-label={`${name}${unread[agent.id] ? ", unread" : ", read"}${waiting ? `, ${needsResponse ? "waiting for your response" : `${waiting} pending approval${waiting > 1 ? "s" : ""}`}` : ""}`}
                  className={`${styles.chatRow} ${agent.id === selectedId ? styles.selected : ""}`}
                  onClick={() => {
                    if (isHero) finish()
                    selectChat(agent.id)
                    setSidebarOpen(false)
                    atBottom.current = true
                  }}
                >
                  <span
                    className={styles.sidebarAvatar}
                    data-attention={awaiting || undefined}
                  >
                    <Avatar
                      agent={{
                        ...agent,
                        unread: false,
                      }}
                      waiting={awaiting}
                      working={currentHero && !!hero.pending}
                    />
                    {unread[agent.id] && agent.id !== selectedId && (
                      <span className={styles.unread} aria-hidden="true" />
                    )}
                    {awaiting && (
                      <span className={styles.attentionDot} aria-hidden="true">
                        {needsResponse ? "?" : "!"}
                      </span>
                    )}
                  </span>
                  <span
                    className={styles.rowContent}
                    data-empty={!preview || undefined}
                  >
                    <span className={styles.rowHeading}>
                      <span key={name}>{name}</span>
                      <time>{agent.time}</time>
                    </span>
                    <span className={styles.preview}>
                      {waiting ? (
                        <span className={styles.waitingLabel}>
                          {needsResponse
                            ? "Waiting for your response"
                            : `${waiting} approval${waiting > 1 ? "s" : ""} needed`}
                        </span>
                      ) : (
                        preview || "\u00a0"
                      )}
                    </span>
                  </span>
                </button>
              )
            })}
          {!demoAgents.some((agent) =>
            `${agent.id === "new-bot" ? setupName : agent.id === "prospecting" ? "Prospecting" : agent.name} ${agent.preview}`
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
          <Tooltip>
            <TooltipTrigger
              tabIndex={0}
              render={<span className={styles.exampleLabel}>Example</span>}
            />
            <TooltipContent>
              {
                "Interactive example. Decisions stay in this browser; no real messages are sent."
              }
            </TooltipContent>
          </Tooltip>
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
            <div hidden={!isSetup}>
              <DemoSetup
                onName={setSetupName}
                onWaiting={reportSetupWaiting}
                onDecision={recordDecision}
                onConfirmation={recordReply}
              />
            </div>
            {demoAgents.map((agent) => {
              const currentHero = agent.id === "prospecting"
              const chatEntries = currentHero ? hero.entries : agent.entries
              return (
                <div
                  key={agent.id}
                  hidden={agent.id !== selectedId}
                  className={styles.chatTranscript}
                >
                  {chatEntries.map((entry, index) => (
                    <div
                      key={`${agent.id}-${index}`}
                      className={`${styles.entry} ${index > 0 && entry.kind !== chatEntries[index - 1].kind ? styles.roleChange : ""}`}
                    >
                      {index === 0 && (
                        <div className={styles.timestamp}>
                          {currentHero
                            ? "Today 1:08 PM"
                            : agent.time === "Yesterday"
                              ? "Yesterday 3:08 PM"
                              : `Today ${agent.time}`}
                        </div>
                      )}
                      <Entry
                        entry={entry}
                        agent={agent}
                        agentName={currentHero ? hero.name : agent.name}
                        decisionId={`${agent.id}:${index}`}
                        onDecision={recordDecision}
                        onConfirmation={recordReply}
                        screen={currentHero ? hero.screen : screen}
                        status={hero.computerStatus}
                        onScreen={() => {
                          finish()
                          setOverlayOpen(true)
                        }}
                        onAgent={openAgent}
                      />
                    </div>
                  ))}
                </div>
              )
            })}
            {Object.values(replies)
              .filter((reply) => reply.chatId === selectedId)
              .sort((a, b) => a.order - b.order)
              .map((reply) => (
                <div key={reply.id} className={styles.entry}>
                  {reply.kind === "user" ? (
                    <Entry
                      entry={{ kind: "user", text: reply.text }}
                      screen={screen}
                      status={hero.computerStatus}
                      onScreen={() => setOverlayOpen(true)}
                      onAgent={openAgent}
                    />
                  ) : (
                    <DemoResponse
                      name={reply.name}
                      agent={
                        mentionBots.find((bot) => bot.id === reply.botId) ??
                        selected
                      }
                      confirmation
                      showAuthor={
                        selected.group ||
                        (!!reply.botId && reply.botId !== selectedId)
                      }
                    >
                      {reply.text}
                    </DemoResponse>
                  )}
                </div>
              ))}
            {invocation.pending[selectedId] && (
              <DemoActivity
                name={invocation.pending[selectedId].name}
                agent={invocation.pending[selectedId]}
              />
            )}
            {isHero && hero.pending && (
              <DemoActivity
                name={selectedName}
                agent={selected}
                state={
                  hero.pending === "Thinking" || hero.pending === "Spawning"
                    ? "thinking"
                    : "working"
                }
              />
            )}
          </div>
        </div>
        <div className={styles.composerArea}>
          <div className={styles.composerFade} aria-hidden="true" />
          <DemoComposer
            demoDraft={isHero ? hero.draft : undefined}
            bots={mentionBots}
            name={selectedName}
            disabled={!!invocation.pending[selectedId]}
            onSend={(text, mentions) => {
              atBottom.current = true
              if (isHero) finish()
              void invocation.send(
                selectedId,
                text,
                mentions,
                mentionBots,
                decisions
              )
            }}
          />
        </div>
      </div>
      {computerOpen && !selected.group && (
        <DemoComputerPane
          key={selectedId}
          selected={selected}
          selectedName={selectedName}
          screen={screen}
          routines={routines}
          onScreen={() => setOverlayOpen(true)}
          onClose={() => setComputerOpen(false)}
        />
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
              aria-modal="true"
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
