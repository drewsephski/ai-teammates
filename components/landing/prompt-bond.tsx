"use client"

// Inspired by Prompt Bond by Cojeev (MIT): https://cojeev.com/ui/
// Rebuilt for Krafty with scoped CSS and SVG instead of global themes and WebGL.
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { motion, useInView } from "motion/react"
import {
  BrainIcon,
  CheckIcon,
  FileTextIcon,
  MonitorIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SlidersHorizontalIcon,
  UsersIcon,
} from "lucide-react"

import { botPresets } from "@/lib/bot-presets"
import { AnimatedArrow } from "@/components/ui/animated-arrow"
import { demoScenarios } from "./demo-scenarios"
import { PromptBondResult } from "./prompt-bond-result"
import styles from "./prompt-bond.module.css"

const stages = ["Prompt", "Recall", "Work", "Handoff", "Result"] as const
const positions = [
  { x: 17, y: 19, path: "M190 85C310 85 310 190 420 210" },
  { x: 14, y: 50, path: "M160 225C260 225 320 225 420 225" },
  { x: 18, y: 81, path: "M200 365C320 365 320 265 420 240" },
  { x: 83, y: 19, path: "M930 85C800 85 800 190 700 210" },
  { x: 86, y: 50, path: "M960 225C860 225 800 225 700 225" },
  { x: 82, y: 81, path: "M920 365C800 365 800 265 700 240" },
] as const

const scenes = demoScenarios.map((example) => {
  const instructions = botPresets.find((preset) => preset.id === example.id)!
  const reviewer = example.id === "writing" ? "Ada" : "Juno"
  const sourceFile = example.terminal[0].replace("read /workspace/", "")
  return {
    ...example,
    context: [
      {
        title: "Your preferences",
        subtitle: "Saved memory",
        detail: example.memory,
        icon: BrainIcon,
        stage: 1,
      },
      {
        title: sourceFile,
        subtitle: "Workspace file",
        detail: `The example source file your teammate reads: ${sourceFile}.`,
        icon: FileTextIcon,
        stage: 2,
      },
      {
        title: "Your instructions",
        subtitle: "Made yours",
        detail: instructions.instructions,
        icon: SlidersHorizontalIcon,
        stage: 1,
      },
      {
        title: example.name,
        subtitle: example.role,
        detail: `${example.name} takes the lead on this ${example.label.toLowerCase()} example, using the context you provide.`,
        icon: UsersIcon,
        stage: 1,
      },
      {
        title: "Cloud computer",
        subtitle: "A place to work",
        detail:
          "A persistent workspace with files, a browser, and a terminal. Open the live view in Krafty to follow the work.",
        icon: MonitorIcon,
        stage: 2,
      },
      {
        title: reviewer,
        subtitle: "A second perspective",
        detail: `In this illustrative group chat, ${example.name} hands the draft to ${reviewer} for a second perspective before you review it.`,
        icon: UsersIcon,
        stage: 3,
      },
    ],
    captions: [
      "Choose an example. See how a little context becomes a useful starting point.",
      `${example.name} brings your saved preferences and instructions into the conversation.`,
      `${example.name} reads the example file and works on its cloud computer.`,
      `${example.name} brings ${reviewer} into the group conversation for a second perspective.`,
      "The example result is ready for your review. Ask your teammate to remember anything useful for next time.",
    ],
  }
})

function subscribeMotionPreferences(callback: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)")
  media.addEventListener("change", callback)
  document.addEventListener("visibilitychange", callback)
  return () => {
    media.removeEventListener("change", callback)
    document.removeEventListener("visibilitychange", callback)
  }
}
const readMotionPreferences = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "reduced"
    : document.visibilityState === "visible"
      ? "visible"
      : "hidden"
const serverMotionPreferences = () => "hidden" as const

export function PromptBond({ startHref }: { startHref: string }) {
  const [selected, setSelected] = useState(0)
  const [stage, setStage] = useState(0)
  const [running, setRunning] = useState(false)
  const [inspected, setInspected] = useState<number | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const inView = useInView(root, { amount: 0.25 })
  const preferences = useSyncExternalStore(
    subscribeMotionPreferences,
    readMotionPreferences,
    serverMotionPreferences
  )
  const reducedMotion = preferences === "reduced"
  const moving = inView && preferences === "visible"
  const playing = running && moving && stage < stages.length - 1
  const example = scenes[selected]
  const detail = inspected === null ? null : example.context[inspected]
  const complete = stage === stages.length - 1

  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => {
      setStage((current) => Math.min(current + 1, stages.length - 1))
      if (stage === stages.length - 2) setRunning(false)
    }, 2200)
    return () => window.clearTimeout(timer)
  }, [playing, stage, selected])

  function reset(index = selected) {
    setSelected(index)
    setStage(0)
    setRunning(false)
    setInspected(null)
  }

  function play() {
    setInspected(null)
    if (reducedMotion) {
      setStage(stages.length - 1)
      setRunning(false)
    } else if (stage === 0 || complete) {
      setStage(1)
      setRunning(true)
    } else {
      setRunning((current) => !current)
    }
  }

  return (
    <div
      ref={root}
      className={styles.bond}
      data-moving={moving && (stage === 0 || running)}
      data-stage={stage}
      aria-labelledby="prompt-bond-title"
    >
      <div className={styles.heading}>
        <span className={styles.eyebrow}>A LITTLE CONTEXT GOES A LONG WAY</span>
        <h3 id="prompt-bond-title">One prompt. Good company.</h3>
        <p>
          Your preferences, your files, your people. Part of the conversation.
        </p>
      </div>
      <div
        className={styles.examples}
        role="group"
        aria-label="Choose a prompt example"
      >
        {scenes.map((scene, index) => (
          <button
            key={scene.id}
            type="button"
            aria-pressed={selected === index}
            onClick={() => reset(index)}
          >
            {scene.label} <AnimatedArrow direction="diagonal" size={12} />
          </button>
        ))}
      </div>
      <div className={styles.theatre}>
        <svg
          className={styles.connections}
          viewBox="0 0 1120 450"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden="true"
        >
          {example.context.map((item, index) => (
            <g key={index} data-active={stage >= item.stage}>
              <path d={positions[index].path} />
              <path d={positions[index].path} className={styles.signal} />
            </g>
          ))}
        </svg>
        <div className={styles.membrane} aria-hidden="true">
          <svg viewBox="0 0 600 430" fill="none">
            <motion.path
              initial={false}
              animate={{
                d:
                  stage === 0
                    ? "M75 172C82 90 164 44 262 68C361 18 500 65 523 161C559 246 509 347 411 354C324 407 201 371 130 332C65 300 44 228 75 172Z"
                    : "M65 134C96 61 194 43 290 51C391 38 509 75 539 155C567 242 525 344 437 369C339 395 185 395 108 338C40 293 33 213 65 134Z",
              }}
              transition={{ duration: moving ? 1.2 : 0 }}
            />
          </svg>
        </div>
        <div className={styles.core}>
          <div className={styles.coreIdentity}>
            <span className={styles.face} aria-hidden="true">
              <i />
              <i />
            </span>
            <span>
              {stage === 0
                ? "A thought, ready to go."
                : `${example.name} & your team`}
            </span>
          </div>
          <div className={styles.prompt}>
            <p>{example.prompt}</p>
            <button
              type="button"
              onClick={play}
              aria-label={
                running && !complete
                  ? "Pause prompt example"
                  : complete
                    ? "Replay prompt example"
                    : "Play prompt example"
              }
            >
              {running && !complete ? (
                <PauseIcon size={18} />
              ) : (
                <AnimatedArrow direction="up" size={20} />
              )}
            </button>
          </div>
          <div className={styles.work}>
            {stage === 0 ? (
              <p className={styles.invitation}>
                A role, a memory, a computer.
                <br />
                See what they bring to your next idea.
              </p>
            ) : (
              <ol aria-label="Prompt example progress">
                {[
                  "Bring in your preferences",
                  example.steps[0],
                  "Get a second perspective",
                ].map((label, index) => (
                  <li key={label} data-reached={stage >= index + 1}>
                    <span>
                      {stage > index + 1 ? (
                        <CheckIcon size={12} />
                      ) : (
                        <span className={styles.dot} />
                      )}
                    </span>
                    {label}
                  </li>
                ))}
              </ol>
            )}
            {complete && <PromptBondResult example={example} />}
          </div>
        </div>
        <div
          className={styles.context}
          role="group"
          aria-label="Explore the example context"
        >
          {example.context.map((item, index) => (
            <div
              key={`${example.id}-${index}`}
              className={styles.contextPosition}
              style={{
                left: `${positions[index].x}%`,
                top: `${positions[index].y}%`,
              }}
            >
              <button
                className={styles.contextNode}
                type="button"
                data-active={stage >= item.stage}
                data-selected={inspected === index}
                aria-pressed={inspected === index}
                aria-label={`Explore ${item.title}`}
                onClick={() =>
                  setInspected((current) => (current === index ? null : index))
                }
              >
                <span className={styles.nodeIcon} aria-hidden="true">
                  {index === 3 || index === 5 ? (
                    <span className={styles.miniFace}>
                      <i />
                      <i />
                    </span>
                  ) : (
                    <item.icon size={18} strokeWidth={1.5} />
                  )}
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>
      <div
        className={styles.caption}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span>
          {detail
            ? detail.subtitle
            : complete
              ? "YOURS TO TAKE FORWARD"
              : stages[stage]}
        </span>
        <p>{detail ? detail.detail : example.captions[stage]}</p>
      </div>
      <div
        className={styles.timeline}
        role="group"
        aria-label="Explore prompt example steps"
      >
        {stages.map((label, index) => (
          <button
            key={label}
            type="button"
            aria-label={`Show ${label.toLowerCase()} step`}
            aria-pressed={stage === index}
            data-reached={stage >= index}
            onClick={() => {
              setStage(index)
              setRunning(false)
              setInspected(null)
            }}
          >
            <span aria-hidden="true">
              {stage > index ? <CheckIcon size={10} /> : index + 1}
            </span>
            {label}
          </button>
        ))}
      </div>
      <div className={styles.bottom}>
        <div className={styles.controls}>
          <button type="button" onClick={play}>
            {running && !complete ? (
              <PauseIcon size={13} />
            ) : (
              <PlayIcon size={13} />
            )}
            {reducedMotion
              ? "Show result"
              : running && !complete
                ? "Pause"
                : complete
                  ? "Play again"
                  : stage > 0
                    ? "Continue"
                    : "Play example"}
          </button>
          <button
            type="button"
            aria-label="Reset prompt example"
            onClick={() => reset()}
            disabled={stage === 0 && inspected === null}
          >
            <RotateCcwIcon size={14} />
          </button>
        </div>
        <small>Illustrative example · no live agent running</small>
        <Link href={startHref} prefetch={false}>
          Give it your own idea <AnimatedArrow direction="right" size={14} />
        </Link>
      </div>
    </div>
  )
}
