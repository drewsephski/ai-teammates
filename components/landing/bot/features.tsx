import type { CSSProperties } from "react"
import { BotMark } from "./bot-mark"
import styles from "./features.module.css"

/** Decorative browser scenes reproduce the source's wireframe illustrations. */
function BrowserScene({ dashboard = false }: { dashboard?: boolean }) {
  return (
    <svg className={styles.browser} viewBox="0 0 360 225" fill="none">
      <rect width="360" height="225" rx="5" fill="#0b0b0c" />
      <path
        d="M0 14H360M0 26H360M60 26V225"
        stroke="#242426"
        strokeWidth=".8"
      />
      {[8, 15, 22].map((x) => (
        <circle key={x} cx={x} cy="7" r="2" fill="#414143" />
      ))}
      <rect x="116" y="18" width="128" height="5" rx="2.5" fill="#151517" />
      {[39, 53, 67, 81, 105, 119].map((y, i) => (
        <rect
          key={y}
          x="8"
          y={y}
          width={i % 2 ? 24 : 32}
          height="4"
          rx="2"
          fill="#242426"
        />
      ))}
      {dashboard ? (
        <>
          <rect x="77" y="42" width="69" height="4" rx="2" fill="#333335" />
          {[77, 169, 261].map((x) => (
            <g key={x}>
              <rect
                x={x}
                y="59"
                width="84"
                height="31"
                rx="4"
                stroke="#333335"
              />
              <rect
                x={x + 8}
                y="67"
                width="31"
                height="4"
                rx="2"
                fill="#333335"
              />
              <rect
                x={x + 8}
                y="77"
                width="43"
                height="3"
                rx="1.5"
                fill="#252527"
              />
            </g>
          ))}
          {[45, 24, 65, 32, 75, 40, 86, 52, 69, 92].map((height, i) => (
            <rect
              key={i}
              x={77 + i * 27}
              y={210 - height}
              width="21"
              height={height}
              rx="1"
              fill="#323234"
            />
          ))}
        </>
      ) : (
        <>
          <rect x="74" y="38" width="212" height="10" rx="5" stroke="#343436" />
          <circle cx="82" cy="43" r="2" stroke="#555558" />
          <rect x="90" y="41" width="53" height="3" rx="1.5" fill="#222224" />
          <rect x="294" y="38" width="49" height="10" rx="5" stroke="#343436" />
          <rect x="301" y="42" width="27" height="3" rx="1.5" fill="#555558" />
          <path d="M244 56V225" stroke="#262628" />
          {[64, 83, 102, 121, 140, 159].map((y, i) => (
            <g key={y}>
              <rect
                x="72"
                y={y - 5}
                width="163"
                height="16"
                rx="3"
                fill={i === 1 ? "#28282a" : "#0b0b0c"}
              />
              <circle
                cx="80"
                cy={y + 2}
                r="3"
                fill={i < 2 ? "#555558" : "#28282a"}
              />
              <rect
                x="90"
                y={y}
                width={[68, 96, 55, 85, 48, 70][i]}
                height="4"
                rx="2"
                fill={i === 1 ? "#555558" : "#29292c"}
              />
              <rect
                x="210"
                y={y - 1}
                width="18"
                height="7"
                rx="3.5"
                fill="#252527"
              />
            </g>
          ))}
          <rect x="254" y="60" width="53" height="4" rx="2" fill="#414144" />
          {[72, 81, 124, 133, 142].map((y, i) => (
            <rect
              key={y}
              x="254"
              y={y}
              width={i % 2 ? 58 : 77}
              height="3"
              rx="1.5"
              fill="#29292c"
            />
          ))}
          <rect x="254" y="94" width="38" height="10" rx="5" fill="#d3d3d4" />
          <rect x="261" y="98" width="24" height="3" rx="1.5" fill="#313133" />
          <rect
            x="253"
            y="117"
            width="87"
            height="40"
            rx="4"
            stroke="#29292c"
          />
        </>
      )}
    </svg>
  )
}

function ComputerIllustration({
  instructions = false,
}: {
  instructions?: boolean
}) {
  return (
    <div
      className={`${styles.computer} ${instructions ? styles.instructions : ""}`}
    >
      <div className={styles.computerHeader}>
        <span>
          {instructions ? "Weekly Reporting · Instructions" : "Computer"}
        </span>
        <span className={styles.working}>
          {instructions ? "Context saved" : "✺ Working"}
        </span>
      </div>
      {!instructions && (
        <p className={styles.computerPrompt}>
          Sign in to Zendesk so I can work the support queue.
        </p>
      )}
      <div
        className={`${styles.desktop} ${instructions ? styles.dashboardDesktop : ""}`}
      >
        <BrowserScene dashboard={instructions} />
        <span className={styles.cursor}>
          <svg viewBox="0 0 18 20" fill="none">
            <path
              d="M2 1L16 11L10 12L7 18L2 1Z"
              fill={instructions ? "#fff" : "#eb4699"}
              stroke="white"
              strokeWidth="1.5"
            />
          </svg>
          <span>{instructions ? "You" : "Krafty"}</span>
        </span>
      </div>
    </div>
  )
}

function MemoryIllustration() {
  return (
    <div className={styles.memory}>
      <p className={styles.bubble}>
        Acme replied on pricing, same thread as last quarter. I already had the
        context, so I answered without waiting on you.
      </p>
      <p className={styles.bubble}>
        Noted for next time: they only sign annual, and Dana is the one who
        approves.
      </p>
      <div className={styles.memoryReceipt}>
        Updated memory for{" "}
        <span>
          <BotMark color="#885cf5" />
          Account Manager
        </span>
      </div>
    </div>
  )
}

const teammates = [
  { color: "#54b9a6", label: "Asking Research…" },
  { color: "#885cf5", label: "Looping in Comms…" },
  { color: "#ea4045", label: "Sending to Chief…" },
  { color: "#f19d38", label: "Pinging Travel…" },
]

function CollaborationIllustration() {
  return (
    <div className={styles.collaboration}>
      {teammates.map(({ color, label }, index) => (
        <div
          className={styles.teammate}
          key={label}
          style={
            {
              "--teammate-color": color,
              "--teammate-order": index,
            } as CSSProperties
          }
        >
          <span className={styles.avatar}>
            <BotMark color={color} />
          </span>
          <span className={styles.activity}>{label}</span>
        </div>
      ))}
    </div>
  )
}

export function BotFeatures() {
  return (
    <>
      <section
        className={styles.statementSection}
        aria-labelledby="statement-title"
      >
        <div className={styles.statement}>
          <div className={styles.statementCopy}>
            <h2 id="statement-title">Message Bots like teammates</h2>
            <p>
              Give tasks to Bots like you would a teammate. Your AI teammates
              take projects from start to end, keep context on how you work, and
              come back when they need your input.
            </p>
          </div>
          <BotMark className={styles.statementCharacter} color="#fff" />
        </div>
      </section>
      <section
        id="features"
        className={styles.features}
        aria-labelledby="features-title"
      >
        <div className={styles.heading}>
          <h2 id="features-title">Work with many Bots at once</h2>
          <p>
            Create a Bot, give it a task, and add another when the work
            grows—one on a project, one on outbound, one on systems. AI
            teammates work in parallel and collaborate where it makes sense.
          </p>
        </div>
        <div className={styles.grid}>
          <article className={styles.card}>
            <h3>Krafty Bot works where you work</h3>
            <p>
              Connect your apps or sign in on a Bot’s computer. It uses your
              tools and websites to get work done.
            </p>
            <div className={styles.figure} aria-hidden="true">
              <ComputerIllustration />
            </div>
          </article>
          <article className={styles.card}>
            <h3>Give a Bot your way of working</h3>
            <p>
              Set its role and instructions once. Your teammate carries that
              context into the next task.
            </p>
            <div className={styles.figure} aria-hidden="true">
              <ComputerIllustration instructions />
            </div>
          </article>
          <article className={styles.card}>
            <h3>Bots get smarter over time</h3>
            <p>
              Bots can save context to memory. Show one what matters today and
              pick up where you left off.
            </p>
            <div className={styles.figure} aria-hidden="true">
              <MemoryIllustration />
            </div>
          </article>
          <article className={styles.card}>
            <h3>Connect the Bots</h3>
            <p>
              Put a few Bots in the same thread and they pass work between
              themselves. Bring the right specialists into one conversation.
            </p>
            <div className={styles.figure} aria-hidden="true">
              <CollaborationIllustration />
            </div>
          </article>
        </div>
      </section>
    </>
  )
}
