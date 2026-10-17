import Link from "next/link"
import { BotMark } from "./bot-mark"
import {
  roleScenarios,
  type BotRole,
  type RoleEntry,
} from "./role-showcase-data"
import styles from "./role-showcase.module.css"

const cursorGlyphs = {
  back: "\ueab5",
  desktop: "\uea7a",
  plus: "\uea60",
  mic: "\uec12",
  clock: "\uedc0",
  close: "\ued82",
}

export function CursorIcon({
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

export function MiniDesktop({
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
      aria-label="Open your shared computer"
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

export function TranscriptEntry({
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
