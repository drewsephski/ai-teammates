"use client"

import {
  BrainIcon,
  CheckIcon,
  FileTextIcon,
  Maximize2Icon,
  PauseIcon,
  RotateCcwIcon,
  TerminalIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { DemoResult, type DemoScenario } from "./demo-result"
import styles from "./demo.module.css"

export type DemoView = "document" | "terminal" | "memory"

export function DemoComputer({
  example,
  step,
  running,
  view,
  onViewChange,
  onPause,
  onReset,
  onExpand,
}: {
  example: DemoScenario
  step: number
  running: boolean
  view: DemoView
  onViewChange: (view: DemoView) => void
  onPause: () => void
  onReset: () => void
  onExpand: () => void
}) {
  const complete = step === 4
  return (
    <div className={styles.computer}>
      <div className="flex h-12 shrink-0 items-center justify-end px-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!running}
          onClick={onPause}
        >
          <PauseIcon data-icon="inline-start" />
          Pause
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Reset demo computer"
          disabled={step === 0}
          onClick={onReset}
        >
          <RotateCcwIcon />
        </Button>
      </div>
      <div className={styles.viewControls} aria-label="Example computer views">
        {[
          { id: "document" as const, label: "Result", icon: FileTextIcon },
          { id: "terminal" as const, label: "Terminal", icon: TerminalIcon },
          { id: "memory" as const, label: "Memory", icon: BrainIcon },
        ].map((item) => (
          <Button
            key={item.id}
            type="button"
            variant={view === item.id ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={view === item.id}
            onClick={() => onViewChange(item.id)}
          >
            <item.icon data-icon="inline-start" />
            {item.label}
          </Button>
        ))}
      </div>
      <div className={styles.computerBody}>
        {view === "document" &&
          (complete ? (
            <div className={styles.document}>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={styles.expandButton}
                aria-label="Expand example result"
                onClick={onExpand}
              >
                <Maximize2Icon />
              </Button>
              <DemoResult example={example} />
            </div>
          ) : (
            <div className={styles.emptyResult}>
              <FileTextIcon size={25} />
              <h3>
                {step === 0
                  ? "Good work starts here."
                  : "Putting the pieces together."}
              </h3>
              <p>
                {step === 0
                  ? "Send the example task to see the work take shape."
                  : "Explore the terminal and memory while your example progresses."}
              </p>
              <div className={styles.progressTrack}>
                <span style={{ width: `${step * 25}%` }} />
              </div>
              <span>
                {step === 0
                  ? "Ready when you are"
                  : `${step} of 3 steps in progress`}
              </span>
            </div>
          ))}
        {view === "terminal" && (
          <div className={styles.terminal}>
            <div>
              <span />
              <span />
              <span />
              <small>/workspace</small>
            </div>
            <p>EXAMPLE TOOL ACTIVITY</p>
            {example.terminal.map((line, index) => (
              <div
                key={line}
                className={
                  step >= index + 1
                    ? styles.terminalLine
                    : styles.terminalPending
                }
              >
                <span>›</span>
                <code>{line}</code>
                {step > index + 1 && <CheckIcon size={11} />}
              </div>
            ))}
            <div className={styles.terminalFooter}>
              {complete
                ? "✓ Example file saved. Ready for review."
                : "Tool activity appears as the example progresses."}
            </div>
          </div>
        )}
        {view === "memory" && (
          <div className={styles.memory}>
            <span>
              <BrainIcon size={20} />
            </span>
            <small>EXAMPLE SAVED CONTEXT</small>
            <h3>A teammate that knows your preferences.</h3>
            <blockquote>“{example.memory}”</blockquote>
            <p>
              Ask your real teammate to remember what matters. Saved notes stay
              with it across conversations.
            </p>
          </div>
        )}
      </div>
      <p className="pb-4 text-center text-sm text-muted-foreground">
        {example.name}&apos;s screen{" "}
        <span className="text-xs">· illustrative example</span>
      </p>
    </div>
  )
}
