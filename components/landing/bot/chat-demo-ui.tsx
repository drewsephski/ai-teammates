"use client"

import { BotMark } from "./bot-mark"
import { demoAgents, type DemoAgent, type DemoEntry } from "./chat-demo-data"
import { DemoDesktop } from "./chat-demo-screen"
import type { DemoScreen } from "./chat-demo-timeline"
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
export function DemoIcon({
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
export function DemoAvatar({
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
          style={{
            color: demoAgents.find((agent) => agent.name === part.slice(2, -1))
              ?.color,
          }}
          onClick={() => onAgent(part.slice(2, -1))}
        >
          <DemoAvatar
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

export function DemoEntryView({
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
        {entry.text.startsWith("Created routine") ? (
          <>
            <span>Created routine</span>
            <DemoIcon name="clock" size={15} />
            <span>{entry.text.slice("Created routine ".length)}</span>
          </>
        ) : (
          entry.text
        )}
        {entry.targets
          ? entry.targets.map((name, index) => (
              <span key={name}>
                {index > 0 && <span className={styles.and}>and</span>}
                <button type="button" onClick={() => onAgent(name)}>
                  <DemoAvatar
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
          : null}
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
                <DemoIcon name="loading" size={12} />
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
