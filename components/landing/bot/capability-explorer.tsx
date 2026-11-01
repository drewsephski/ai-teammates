"use client"

import { useId, useRef, useState, type KeyboardEvent } from "react"
import Image from "next/image"
import {
  BrainIcon,
  CalendarClockIcon,
  GlobeIcon,
  MonitorIcon,
  PlugIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"

import styles from "./capability-explorer.module.css"

type Capability = { id: string; title: string; body: string }

const art: Record<string, { src: string; Icon: LucideIcon }> = {
  memory: { src: "memory", Icon: BrainIcon },
  computer: { src: "computer", Icon: MonitorIcon },
  apps: { src: "connect", Icon: PlugIcon },
  research: { src: "research", Icon: GlobeIcon },
  routines: { src: "routines", Icon: CalendarClockIcon },
  teams: { src: "teams", Icon: UsersIcon },
}

/**
 * Capabilities as tabs: one picture and one paragraph at a time. Every panel
 * stays in the HTML, so the full text is still there for search and readers.
 */
export function CapabilityExplorer({
  capabilities,
}: {
  capabilities: readonly Capability[]
}) {
  const [active, setActive] = useState(0)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const base = useId()

  function onKeyDown(event: KeyboardEvent) {
    const last = capabilities.length - 1
    const next =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? active === last
          ? 0
          : active + 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? active === 0
            ? last
            : active - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null
    if (next === null) return
    event.preventDefault()
    setActive(next)
    tabs.current[next]?.focus()
  }

  return (
    <div className={styles.explorer}>
      <div className={styles.stage}>
        {capabilities.map((capability, index) => {
          const { src } = art[capability.id] ?? art.computer
          return (
            <Image
              key={capability.id}
              src={`/marketing/visuals/how-it-works/${src}.webp`}
              alt=""
              fill
              sizes="(max-width: 1023px) 100vw, 620px"
              className={styles.visual}
              data-active={index === active ? "" : undefined}
            />
          )
        })}
        {capabilities.map((capability, index) => (
          <div
            key={capability.id}
            id={`${base}-panel-${index}`}
            role="tabpanel"
            aria-labelledby={`${base}-tab-${index}`}
            hidden={index !== active}
            className={styles.panel}
          >
            <p>{capability.body}</p>
          </div>
        ))}
      </div>
      <div
        role="tablist"
        aria-label="What every Bot has"
        aria-orientation="vertical"
        className={styles.tabs}
        onKeyDown={onKeyDown}
      >
        {capabilities.map((capability, index) => {
          const { Icon } = art[capability.id] ?? art.computer
          const selected = index === active
          return (
            <button
              key={capability.id}
              ref={(node) => {
                tabs.current[index] = node
              }}
              id={`${base}-tab-${index}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${base}-panel-${index}`}
              tabIndex={selected ? 0 : -1}
              className={styles.tab}
              onClick={() => setActive(index)}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") setActive(index)
              }}
            >
              <span className={styles.icon} aria-hidden="true">
                <Icon size={18} strokeWidth={1.6} />
              </span>
              <span id={capability.id} className={styles.tabTitle}>
                {capability.title}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
