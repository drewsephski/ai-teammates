"use client"

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type CSSProperties,
} from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowRightIcon, CheckIcon, LoaderCircleIcon } from "lucide-react"
import { BotMark } from "./bot-mark"
import {
  SupportScreen,
  DashboardScreen,
  SUPPORT_TIMELINE,
  SUPPORT_INITIAL,
  SUPPORT_FINAL,
  SUPPORT_CURSOR,
  RECORDING_TIMELINE,
  RECORDING_INITIAL,
  RECORDING_FINAL,
  RECORDING_CURSOR,
  RECORDING_SECONDS,
  RECORDING_START,
} from "./feature-browser"
import { ComputerCursor } from "../computer-cursor"
import styles from "./feature-scenes.module.css"

const EASE = [0.4, 0, 0.2, 1] as const
const CYCLE_MS = 9300
const SCENE_FRAME_TIMES = {
  support: [...SUPPORT_TIMELINE.map((event) => event.atMs), 9000, CYCLE_MS],
  recording: [
    ...new Set([
      ...RECORDING_TIMELINE.map((event) => event.atMs),
      2250,
      3250,
      4250,
      9000,
      CYCLE_MS,
    ]),
  ].sort((a, b) => a - b),
  memory: [700, 2200, 9000, CYCLE_MS],
  collaboration: [900, 2900, 4900, 6900, 7800, 9000, CYCLE_MS],
}

/** Pause offscreen; hold the result before fading and replaying. */
function usePlayback(
  ref: RefObject<HTMLElement | null>,
  frameTimes: readonly number[]
) {
  const elapsed = useRef(0)
  const [time, setTime] = useState(0)
  const [inView, setInView] = useState(false)
  const [visible, setVisible] = useState(true)
  const reduced = useReducedMotion()
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.intersectionRatio >= 0.35),
      { threshold: 0.35 }
    )
    observer.observe(element)
    const onVisibility = () => setVisible(!document.hidden)
    onVisibility()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      observer.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [ref])
  const playing = inView && visible && !reduced
  useEffect(() => {
    if (!playing) return
    const startedAt = performance.now()
    const priorElapsed = elapsed.current
    let timer = 0
    const advance = () => {
      const total = priorElapsed + performance.now() - startedAt
      setTime(total)
      const position = total % CYCLE_MS
      const next = frameTimes.find((at) => at > position) ?? CYCLE_MS
      timer = window.setTimeout(advance, Math.max(1, next - position))
    }
    timer = window.setTimeout(advance, 0)
    return () => {
      elapsed.current = priorElapsed + performance.now() - startedAt
      window.clearTimeout(timer)
    }
  }, [playing, frameTimes])
  return {
    time: time % CYCLE_MS,
    run: Math.floor(time / CYCLE_MS),
    playing,
    instant: !!reduced || time === 0,
    dimmed: !reduced && time % CYCLE_MS >= 9000,
  }
}
function phase<T>(
  time: number,
  initial: T,
  final: T,
  events: readonly { atMs: number; value: T }[],
  instant: boolean
) {
  if (instant) return final
  let value = initial
  for (const event of events) if (time >= event.atMs) value = event.value
  return value
}

export function FeatureCard({
  title,
  body,
  scene,
}: {
  title: string
  body: string
  scene: "support" | "recording" | "memory" | "collaboration"
}) {
  const cardRef = useRef<HTMLElement>(null)
  const playback = usePlayback(cardRef, SCENE_FRAME_TIMES[scene])
  return (
    <article
      ref={cardRef}
      className={styles.card}
      data-paused={!playback.playing || undefined}
    >
      <h3>{title}</h3>
      <p>{body}</p>
      <figure className={styles.figure} aria-hidden="true">
        <div className={styles.stage}>
          <div className={styles.snippet}>
            {scene === "support" && <SupportIllustration {...playback} />}
            {scene === "recording" && <RecordingIllustration {...playback} />}
            {scene === "memory" && <MemoryIllustration {...playback} />}
            {scene === "collaboration" && (
              <CollaborationIllustration {...playback} />
            )}
          </div>
        </div>
      </figure>
    </article>
  )
}
type Playback = ReturnType<typeof usePlayback>
function RemoteDesktop({
  children,
  dashboard = false,
}: {
  children: ReactNode
  dashboard?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(() =>
      setScale(element.clientWidth / 360)
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const width = dashboard ? 0.68 : 0.64
  const height = dashboard ? 0.8 : 0.6
  return (
    <div
      ref={ref}
      className={`${styles.desktop} ${dashboard ? styles.dashboard : ""}`}
    >
      <div
        className={styles.window}
        style={{
          top: dashboard ? "9%" : "7%",
          left: dashboard ? "16%" : "18%",
          width: `${width * 100}%`,
          height: `${height * 100}%`,
        }}
      >
        <div
          className="flex origin-top-left flex-col"
          style={{
            width: 360 * width,
            height: 225 * height,
            transform: `scale(${scale})`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
function CursorArrow({ fill = "#1a1a1a" }: { fill?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0 -scale-x-100 drop-shadow-[0_0.5px_1px_rgba(0,0,0,0.3)]"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M14.4775 2.375C15.1508 2.37522 15.5719 3.10428 15.2353 3.6875L8.63861 15.1143C8.19099 15.8892 7.00618 15.5716 7.00579 14.6768V7.56348L0.845638 4.00781C0.0708241 3.56015 0.388339 2.37535 1.28314 2.375H14.4775ZM7.69329 6.51758C8.04109 6.7186 8.25579 7.09044 8.25579 7.49219V13.2764L13.8271 3.625H2.68353L7.69329 6.51758Z"
        fill="white"
      />
      <path
        d="M7.69329 6.51758C8.04109 6.7186 8.25579 7.09044 8.25579 7.49219V13.2764L13.8271 3.625H2.68353L7.69329 6.51758Z"
        fill={fill}
      />
    </svg>
  )
}
function Cursor({
  x,
  y,
  bot = false,
  duration = 0.45,
  instant = false,
}: {
  x: number
  y: number
  bot?: boolean
  duration?: number
  instant?: boolean
}) {
  return (
    <motion.div
      className={styles.cursor}
      initial={false}
      animate={{ left: `${x}%`, top: `${y}%`, x: -1.3, y: -2 }}
      transition={{ duration: instant ? 0 : duration, ease: EASE }}
      style={{ scale: 0.75 }}
    >
      <span className={styles.swap}>
        <span data-hidden={!bot || undefined}>
          <CursorArrow fill="#50b6a3" />
          <span className={styles.cursorAvatar}>
            <BotMark color="#50b6a3" active={false} />
          </span>
        </span>
        <span data-hidden={bot || undefined}>
          <CursorArrow />
          <span className={styles.cursorTag}>You</span>
        </span>
      </span>
    </motion.div>
  )
}
function SupportIllustration(playback: Playback) {
  const value = phase(
    playback.time,
    SUPPORT_INITIAL,
    SUPPORT_FINAL,
    SUPPORT_TIMELINE,
    playback.instant
  )
  const at = SUPPORT_CURSOR[value.at]
  return (
    <div className={styles.computer}>
      <div className="flex items-start gap-2">
        <span className={styles.computerTitle}>Cloud computer</span>
        <span className="flex-1" />
        <span className={`${styles.swap} ${styles.badgeSwap}`}>
          <span data-hidden={value.status !== "handed-over" || undefined}>
            <span className={styles.badge}>
              <span className={styles.badgeDot} />
              You&apos;re in control
            </span>
          </span>
          <span data-hidden={value.status !== "working" || undefined}>
            <span className={styles.badge}>
              <LoaderCircleIcon className={styles.spinner} />
              Working
            </span>
          </span>
        </span>
      </div>
      <p className="mt-0.5">
        Sign in to your help desk. I’ll draft the replies.
      </p>
      <div className={`${styles.handoverScreen} mt-2.5`}>
        <ComputerCursor />
        <div className={styles.take} data-dimmed={playback.dimmed || undefined}>
          <RemoteDesktop>
            <SupportScreen screen={value.screen} />
          </RemoteDesktop>
          <Cursor
            {...at}
            bot={value.who === "Bot"}
            instant={playback.instant}
          />
        </div>
      </div>
    </div>
  )
}
function RecordingIllustration(playback: Playback) {
  const value = phase(
    playback.time,
    RECORDING_INITIAL,
    RECORDING_FINAL,
    RECORDING_TIMELINE,
    playback.instant
  )
  const at = RECORDING_CURSOR[value.at as keyof typeof RECORDING_CURSOR]
  const seconds = playback.instant
    ? RECORDING_SECONDS
    : playback.time < RECORDING_START
      ? 0
      : Math.min(
          RECORDING_SECONDS,
          Math.floor((playback.time - RECORDING_START) / 1000) + 1
        )
  return (
    <div
      className={styles.recording}
      data-recording={value.recording || undefined}
    >
      <div className={styles.recordingBar}>
        <div data-hidden={!value.recording || undefined}>
          <span className={styles.recordingLabel}>
            Krafty is learning your Friday recap
          </span>
          <span className={styles.recordingTimer}>
            <span className={styles.recordingDot} />
            0:{String(seconds).padStart(2, "0")}
          </span>
          <span className={styles.recordingClose}>×</span>
        </div>
        <div data-hidden={value.recording || undefined}>
          <span className={styles.recordingLabel} />
          <span
            className={styles.teach}
            data-pressed={value.pressed || undefined}
          >
            <span className={styles.recordDot} />
            Show Krafty
          </span>
        </div>
      </div>
      <div className={styles.recordingScreen}>
        <ComputerCursor />
        <div className={styles.take} data-dimmed={playback.dimmed || undefined}>
          <RemoteDesktop dashboard>
            <DashboardScreen screen={value.screen} />
          </RemoteDesktop>
        </div>
      </div>
      <Cursor {...at} duration={0.5} instant={playback.instant} />
    </div>
  )
}
const MEMORY_MESSAGES = [
  "Keep launch updates short. Lead with what shipped, then what’s next.",
  "Got it. I’ll use that format for your next recap.",
]
function MemoryIllustration(playback: Playback) {
  const count = playback.instant
    ? 3
    : playback.time < 700
      ? 1
      : playback.time < 2200
        ? 2
        : 3
  return (
    <div
      className={`${styles.take} ${styles.memory}`}
      data-dimmed={playback.dimmed || undefined}
    >
      <motion.div
        layout={playback.instant ? false : "position"}
        transition={{ layout: { duration: 0.44, ease: [0.16, 1, 0.3, 1] } }}
        key={playback.run}
      >
        <div className="flex flex-col justify-center gap-1 px-3 py-2">
          {MEMORY_MESSAGES.slice(0, count).map((message, index) => (
            <div
              className={styles.entry}
              data-from={index === 0 ? "you" : "bot"}
              key={message}
            >
              <div className="flex max-w-[min(560px,92%)] flex-col items-start">
                <p className={styles.bubble}>{message}</p>
              </div>
            </div>
          ))}
          {count === 3 && (
            <div className={`${styles.entry} mt-3`}>
              <div className={styles.memoryReceipt}>
                <CheckIcon size={12} /> Remembered by{" "}
                <span className={styles.memoryPill}>
                  <BotMark color="#50b6a3" active={false} />
                  Krafty
                </span>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
const TEAMMATES = [
  {
    color: "#54b9a6",
    label: "Researching the launch",
    result: "Research gathered",
    shape: "blob",
    background: "#012f35",
    ink: "#4ad8ec",
  },
  {
    color: "#885cf5",
    label: "Writing the brief",
    result: "Brief drafted",
    shape: "gem",
    background: "#251f41",
    ink: "#b6b3f9",
  },
  {
    color: "#3c82f6",
    label: "Checking the details",
    result: "Details checked",
    shape: "wedge",
    background: "#002843",
    ink: "#7fc3ff",
  },
  {
    color: "#f19d38",
    label: "Preparing your recap",
    result: "Ready for your review",
    shape: "blob",
    background: "#3b2703",
    ink: "#f8b956",
  },
] as const
function CollaborationPill({
  index,
  activeIndex,
  open,
  active,
  completed,
  instant,
}: {
  index: number
  activeIndex: number
  open: boolean
  active: boolean
  completed: boolean
  instant: boolean
}) {
  const teammate = TEAMMATES[index]
  const labelRef = useRef<HTMLSpanElement>(null)
  const [width, setWidth] = useState(132)
  useEffect(() => {
    const element = labelRef.current
    if (!element) return
    const observer = new ResizeObserver(() => setWidth(element.offsetWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return (
    <motion.li
      className={styles.pill}
      data-open={open || undefined}
      initial={instant ? false : { opacity: 0, y: 16 }}
      animate={{
        opacity: 1,
        y: 0,
        zIndex: 4 - Math.abs(index - activeIndex),
      }}
      transition={{
        opacity: {
          duration: instant ? 0 : 0.5,
          ease: EASE,
          delay: 0.08 * index,
        },
        y: { duration: instant ? 0 : 0.5, ease: EASE, delay: 0.08 * index },
        zIndex: { duration: 0 },
      }}
      style={{
        background: `color-mix(in srgb, ${teammate.background} 32%, #0a0a0a)`,
        ...({
          "--bg": `color-mix(in srgb, ${teammate.background} 32%, #0a0a0a)`,
        } as CSSProperties),
        color: teammate.ink,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${teammate.ink} 28%, #0a0a0a)`,
      }}
    >
      <motion.span
        className={styles.avatar}
        initial={false}
        animate={{ scale: open ? [1, 1.1, 1] : 1 }}
        transition={{
          duration: instant ? 0 : 0.4,
          ease: EASE,
          times: [0, 0.4, 1],
        }}
      >
        <BotMark
          color={teammate.color}
          shape={teammate.shape}
          active={active}
          state={active ? "thinking" : "idle"}
        />
      </motion.span>
      <motion.div
        className={styles.spread}
        initial={false}
        animate={{ width: open ? width : 0 }}
        transition={
          instant
            ? { duration: 0 }
            : { type: "spring", stiffness: 340, damping: 32, mass: 0.9 }
        }
      >
        <motion.span
          ref={labelRef}
          className={styles.activity}
          initial={false}
          animate={{ opacity: open ? 1 : 0, x: open ? 0 : -6 }}
          transition={
            instant
              ? { duration: 0 }
              : open
                ? { duration: 0.28, ease: EASE, delay: 0.12 }
                : { duration: 0.12, ease: EASE }
          }
        >
          {completed ? teammate.result : `${teammate.label}…`}
        </motion.span>
      </motion.div>
    </motion.li>
  )
}
function CollaborationIllustration(playback: Playback) {
  const completed = playback.instant || playback.time >= 7800
  const open = playback.instant
    ? TEAMMATES.length - 1
    : Math.min(
        TEAMMATES.length - 1,
        Math.max(0, Math.floor((playback.time - 900) / 2000))
      )
  return (
    <div
      className={`${styles.take} ${styles.collaboration}`}
      data-dimmed={playback.dimmed || undefined}
    >
      <div className={styles.teamBrief}>
        <span className={styles.teamEyebrow}>Launch team</span>
        <span>One brief. Four teammates.</span>
      </div>
      <ul className={styles.avatarRow} key={playback.run}>
        {TEAMMATES.map((teammate, index) => (
          <CollaborationPill
            key={teammate.label}
            index={index}
            activeIndex={open}
            open={index === open}
            active={playback.playing && !completed && index === open}
            completed={completed}
            instant={playback.instant}
          />
        ))}
      </ul>
      <div
        className={styles.teamOutcome}
        data-complete={completed || undefined}
      >
        {completed ? <CheckIcon size={13} /> : <ArrowRightIcon size={13} />}
        {completed ? "Your launch brief is ready" : "Passing the work forward"}
      </div>
    </div>
  )
}
