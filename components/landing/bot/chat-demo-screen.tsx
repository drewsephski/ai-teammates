"use client"

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import type { DemoScreen } from "./chat-demo-timeline"
import {
  DemoAgentCursor,
  DemoBrowserIcon,
  DemoMailIcon,
} from "./chat-demo-icons"
import styles from "./chat-demo.module.css"

const rows = [
  { name: 86, memo: 70 },
  { name: 68, memo: 90 },
  { name: 80, memo: 58 },
  { name: 58, memo: 82 },
  { name: 88, memo: 66 },
  { name: 66, memo: 88 },
  { name: 76, memo: 54 },
  { name: 62, memo: 78 },
  { name: 82, memo: 64 },
]
const drafts = [
  { name: "Priya Natarajan", opener: 82 },
  { name: "Marcus Webb", opener: 64 },
  { name: "Elena Sørensen", opener: 74 },
  { name: "Daniel Alvarez", opener: 58 },
]
function Bar({
  width = "100%",
  opacity = 0.1,
}: {
  width?: string
  opacity?: number
}) {
  return <span className={styles.wireBar} style={{ width, opacity }} />
}
function Chrome() {
  return (
    <>
      <div className={styles.miniChrome}>
        <span />
        <span />
        <span />
      </div>
      <div className={styles.urlBar}>
        <span />
      </div>
    </>
  )
}

function DesktopWindow({
  children,
  draft = false,
  expanded = false,
}: {
  children: ReactNode
  draft?: boolean
  expanded?: boolean
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const drag = useRef<{
    id: number
    x: number
    y: number
    left: number
    top: number
  } | null>(null)
  return (
    <div
      className={`${styles.desktopWindow} ${draft ? styles.draftWindow : ""}`}
      style={
        {
          "--window-x": `${offset.x}px`,
          "--window-y": `${offset.y}px`,
        } as CSSProperties
      }
      onPointerDown={(event) => {
        if (!expanded || (event.target as HTMLElement).closest("button,input"))
          return
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          left: offset.x,
          top: offset.y,
        }
      }}
      onPointerMove={(event) => {
        const start = drag.current
        if (start && start.id === event.pointerId)
          setOffset({
            x: start.left + event.clientX - start.x,
            y: start.top + event.clientY - start.y,
          })
      }}
      onPointerUp={() => {
        drag.current = null
      }}
      onPointerCancel={() => {
        drag.current = null
      }}
    >
      <div className={styles.windowInterior}>{children}</div>
    </div>
  )
}

export function DemoDesktop({
  screen,
  expanded = false,
  onExpand,
  onSignIn,
}: {
  screen: DemoScreen
  expanded?: boolean
  onExpand?: () => void
  onSignIn?: () => void
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const [crmVisible, setCrmVisible] = useState(true)
  const [draftsVisible, setDraftsVisible] = useState(true)
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const resize = () =>
      element.style.setProperty(
        "--desktop-scale",
        `${Math.max(0.2, Math.min(element.clientWidth / 360, 3))}`
      )
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const settled = screen.view === "settled"
  return (
    <div
      ref={viewport}
      className={styles.remoteDesktop}
      aria-label="Example Salesforce desktop"
    >
      <div className={styles.wallpaper} />
      {crmVisible && (
        <DesktopWindow expanded={expanded}>
          <Chrome />
          {screen.view === "login" ? (
            <div className={styles.login}>
              <span className={styles.loginLogo} />
              <div className={styles.loginFields}>
                <div
                  data-demo-target="portal-email"
                  className={styles.loginField}
                  data-focused={screen.focus === "email" || undefined}
                >
                  {screen.emailChars ? (
                    "drew@krafty.ai".slice(0, screen.emailChars)
                  ) : screen.focus !== "email" ? (
                    <span>Email</span>
                  ) : null}
                  {screen.focus === "email" && <i />}
                </div>
                <div
                  className={styles.loginField}
                  data-focused={screen.focus === "password" || undefined}
                >
                  {screen.passwordChars ? (
                    "•".repeat(screen.passwordChars)
                  ) : (
                    <span>Password</span>
                  )}
                  {screen.focus === "password" && <i />}
                </div>
              </div>
              <button
                type="button"
                data-demo-target="portal-submit"
                onClick={onSignIn}
                className={styles.portalSubmit}
              >
                Sign in
              </button>
            </div>
          ) : (
            <div className={styles.portal}>
              {screen.isWorking && (
                <span className={styles.agentCursor} aria-hidden="true">
                  <DemoAgentCursor />
                </span>
              )}
              <div className={styles.portalSidebar}>
                {[
                  [62, 48, 70],
                  [54, 66, 44, 58],
                ].map((section, index) => (
                  <div key={index}>
                    {section.map((width, i) => (
                      <Bar key={i} width={`${width}%`} opacity={0.09} />
                    ))}
                  </div>
                ))}
              </div>
              <div className={styles.portalTable}>
                <div className={styles.portalToolbar}>
                  <Bar width="30%" opacity={0.16} />
                  <span />
                  <span />
                </div>
                <div className={styles.tableHeading}>
                  <i />
                  <div>
                    <Bar width="45%" opacity={0.14} />
                  </div>
                  <div>
                    <Bar width="50%" opacity={0.14} />
                  </div>
                  <Bar width="11%" opacity={0.14} />
                </div>
                <div className={styles.tableRows}>
                  {rows.map((row, index) => (
                    <div key={index} className={styles.tableRow}>
                      <span
                        className={`${styles.receipt} ${settled || screen.isWorking ? styles.checked : ""}`}
                      >
                        {settled || screen.isWorking ? (
                          <svg
                            viewBox="0 0 12 12"
                            width="6"
                            height="6"
                            fill="none"
                            style={
                              screen.isWorking
                                ? { animationDelay: `${200 + 260 * index}ms` }
                                : undefined
                            }
                          >
                            <circle
                              cx="6"
                              cy="6"
                              r="5.25"
                              stroke="currentColor"
                              strokeWidth=".75"
                              opacity=".4"
                            />
                            <path
                              d="M3.75 6.25l1.6 1.6 2.9-3.4"
                              stroke="currentColor"
                              strokeWidth="1.25"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : null}
                      </span>
                      <i />
                      <div>
                        <Bar width={`${row.name}%`} />
                      </div>
                      <div>
                        <Bar width={`${row.memo}%`} opacity={0.06} />
                      </div>
                      <Bar width="11%" opacity={0.06} />
                    </div>
                  ))}
                </div>
                <div className={styles.tableFooter}>
                  <span>52 accounts</span>
                  <span>36 contacts</span>
                </div>
              </div>
            </div>
          )}
        </DesktopWindow>
      )}
      {settled && draftsVisible && (
        <DesktopWindow expanded={expanded} draft>
          <Chrome />
          <div className={styles.drafts}>
            <div className={styles.draftHeading}>
              <span>Outreach queue</span>
              <Bar width="18%" />
            </div>
            <div className={styles.draftRows}>
              {drafts.map((draft) => (
                <div key={draft.name}>
                  <i />
                  <span>
                    <span>{draft.name}</span>
                    <Bar width={`${draft.opener}%`} opacity={0.08} />
                  </span>
                  <b>Draft</b>
                </div>
              ))}
            </div>
            <div className={styles.draftFooter}>
              <span>36 drafts queued</span>
              <span>0 sent</span>
            </div>
          </div>
        </DesktopWindow>
      )}
      {expanded && (
        <div className={styles.dock} role="toolbar" aria-label="Applications">
          <button
            type="button"
            data-icon="browser"
            data-visible={crmVisible || undefined}
            aria-label={`${crmVisible ? "Hide" : "Show"} CRM portal`}
            onClick={() => setCrmVisible((visible) => !visible)}
          >
            <span className={styles.dockIcon}>
              <DemoBrowserIcon />
            </span>
            <span className={styles.dockIndicator} />
          </button>
          {settled && (
            <button
              type="button"
              data-icon="mail"
              data-visible={draftsVisible || undefined}
              aria-label={`${draftsVisible ? "Hide" : "Show"} Drafts queue`}
              onClick={() => setDraftsVisible((visible) => !visible)}
            >
              <span className={styles.dockIcon}>
                <DemoMailIcon />
              </span>
              <span className={styles.dockIndicator} />
            </button>
          )}
        </div>
      )}
      {!expanded && onExpand && (
        <button
          type="button"
          className={styles.screenExpand}
          onClick={onExpand}
          aria-label="Open example computer screen"
        />
      )}
    </div>
  )
}
