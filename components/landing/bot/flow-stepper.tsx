"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import Image from "next/image"
import { ArrowUpIcon, CheckIcon, LoaderCircleIcon } from "lucide-react"

import styles from "./flow-stepper.module.css"

type Step = { title: string; summary: string; body: string }

const STEP_MS = 6500

// Illustrations from public/marketing/visuals, in the order of `howItWorks`.
const visuals = [
  "/marketing/visuals/how-it-works/describe.webp",
  "/marketing/visuals/how-it-works/connect.webp",
  "/marketing/visuals/how-it-works/work.webp",
  "/marketing/visuals/how-it-works/approve.webp",
] as const

function DescribeDemo() {
  return (
    <div className={styles.demoDescribe}>
      <div className={styles.composer}>
        <span className={styles.field}>
          <span className={styles.typed}>Every Friday, recap my week</span>
        </span>
        <span className={styles.send}>
          <ArrowUpIcon size={14} strokeWidth={2.25} />
        </span>
      </div>
      <div className={styles.reply}>
        <span className={styles.replyDot} />
        <span>Got it. Which apps should I read from?</span>
      </div>
    </div>
  )
}

const connectApps = ["gmail", "google-calendar", "slack", "notion"] as const

function ConnectDemo() {
  return (
    <div className={styles.demoConnect}>
      {connectApps.map((app, index) => (
        <span
          key={app}
          className={styles.appRow}
          style={{ "--i": index } as CSSProperties}
        >
          <span
            className={styles.appLogo}
            style={{ backgroundImage: `url(/landing/bot/apps/${app}.svg)` }}
          />
          <span className={styles.appName}>{app.replace("google-", "")}</span>
          <span className={styles.appState}>
            <CheckIcon size={12} strokeWidth={2.5} />
          </span>
        </span>
      ))}
    </div>
  )
}

const workLog = [
  "Reading this week’s email",
  "Checking the calendar",
  "Opening the browser",
  "Writing the recap",
] as const

function WorkDemo() {
  return (
    <div className={styles.demoWork}>
      <p className={styles.workHead}>
        <LoaderCircleIcon size={13} className={styles.spin} />
        Working on its computer
      </p>
      <ol>
        {workLog.map((line, index) => (
          <li key={line} style={{ "--i": index } as CSSProperties}>
            <CheckIcon size={12} strokeWidth={2.5} />
            {line}
          </li>
        ))}
      </ol>
    </div>
  )
}

function ApproveDemo() {
  return (
    <div className={styles.demoApprove}>
      <p className={styles.approveKicker}>Waiting for you</p>
      <p className={styles.approveTitle}>Send the weekly recap in Slack</p>
      <span className={styles.approveLine} />
      <span className={`${styles.approveLine} ${styles.short}`} />
      <div className={styles.approveActions}>
        <span className={styles.deny}>Deny</span>
        <span className={styles.allow}>
          <span className={styles.allowLabel}>Approve</span>
          <span className={styles.sentLabel}>
            <CheckIcon size={12} strokeWidth={2.5} /> Sent
          </span>
        </span>
      </div>
    </div>
  )
}

const demos = [DescribeDemo, ConnectDemo, WorkDemo, ApproveDemo] as const

/**
 * The four steps as tabs that advance on their own while the section is on
 * screen. Hovering or focusing pauses them; reduced motion turns autoplay off.
 */
export function FlowStepper({ steps }: { steps: readonly Step[] }) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [visible, setVisible] = useState(false)
  const [autoplay, setAutoplay] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setAutoplay(!query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    const element = root.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.35 }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const running = autoplay && visible && !paused

  useEffect(() => {
    if (!running) return
    const timer = window.setTimeout(
      () => setActive((index) => (index + 1) % steps.length),
      STEP_MS
    )
    return () => window.clearTimeout(timer)
  }, [running, active, steps.length])

  const Demo = demos[active]

  return (
    <div
      ref={root}
      className={styles.stepper}
      data-running={running ? "" : undefined}
      style={{ "--step-ms": `${STEP_MS}ms` } as CSSProperties}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <ol className={styles.list}>
        {steps.map((step, index) => (
          <li key={step.title} data-active={index === active ? "" : undefined}>
            <button
              type="button"
              className={styles.tab}
              aria-expanded={index === active}
              aria-controls="flow-stage"
              onClick={() => setActive(index)}
            >
              <span className={styles.number}>0{index + 1}</span>
              <span className={styles.tabTitle}>{step.title}</span>
            </button>
            <p className={styles.body}>{step.body}</p>
            <span className={styles.progress} aria-hidden="true">
              <span key={`${active}-${running}`} />
            </span>
          </li>
        ))}
      </ol>
      <div id="flow-stage" className={styles.stage} aria-hidden="true">
        {visuals.map((src, index) => (
          <Image
            key={src}
            src={src}
            alt=""
            fill
            sizes="(max-width: 1023px) 100vw, 640px"
            className={styles.visual}
            data-active={index === active ? "" : undefined}
          />
        ))}
        <div className={styles.demo} key={active}>
          <Demo />
        </div>
      </div>
    </div>
  )
}
