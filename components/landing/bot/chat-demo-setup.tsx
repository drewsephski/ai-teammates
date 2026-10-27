"use client"

import { useCallback, useEffect, useState } from "react"
import { ChatQuestion } from "@/components/chat-question"
import { DemoApproval } from "./chat-demo-approval"
import { demoFirstTasks } from "./chat-demo-first-task"
import type {
  DemoDecisionState,
  DemoConfirmationHandler,
} from "./chat-demo-inbox"
import { DemoResponse } from "./chat-demo-response"
import { DemoActivity } from "./chat-demo-activity"
import styles from "./chat-demo.module.css"

const options = [
  "Writing and editing",
  "Research and decisions",
  "Planning and getting things done",
]
const profiles = [
  {
    name: "Editor",
    proposal:
      "I’ll go by Editor. I’ll tighten whatever you send, keep your voice, and flag anything that changes the meaning.",
    next: "Send me a draft you’d like to improve.",
  },
  {
    name: "Researcher",
    proposal:
      "I’ll go by Researcher. I’ll compare sources, separate evidence from assumptions, and bring you a clear recommendation.",
    next: "Give me a decision you’re weighing or a topic to investigate.",
  },
  {
    name: "Planner",
    proposal:
      "I’ll go by Planner. I’ll turn your goals into practical next steps, surface dependencies, and help you decide what comes first.",
    next: "Tell me what you want to get done this week.",
  },
]

export function DemoSetup({
  onName,
  onDecision,
  onConfirmation,
  onWaiting,
}: {
  onName: (name: string) => void
  onDecision?: (id: string, state: DemoDecisionState) => void
  onConfirmation?: DemoConfirmationHandler
  onWaiting?: (waiting: boolean, kind?: "response" | "approval") => void
}) {
  const [answer, setAnswer] = useState("")
  const [task, setTask] = useState("")
  const [taskReady, setTaskReady] = useState(false)
  const [taskDecision, setTaskDecision] = useState<DemoDecisionState>("pending")
  const firstTask = demoFirstTasks[Math.max(0, options.indexOf(answer))]
  const [phase, setPhase] = useState<
    "greeting" | "role" | "thinking" | "confirm" | "saving" | "saved"
  >("greeting")
  const saved = phase === "saved"
  const busy =
    phase === "greeting" || phase === "thinking" || phase === "saving"
  const profile = profiles[options.indexOf(answer)] ?? {
    name: "Assistant",
    proposal: `I’ll go by Assistant. I’ll focus on “${answer}”, clarify what matters, and bring you practical next steps.`,
    next: "Send me the first task you want help with.",
  }
  const reset = () => {
    setAnswer("")
    setTask("")
    setTaskReady(false)
    setTaskDecision("pending")
    setPhase("role")
    onName("New bot")
  }
  useEffect(() => {
    if (!busy) return
    const timer = window.setTimeout(
      () => {
        if (phase === "greeting") setPhase("role")
        else if (phase === "thinking") setPhase("confirm")
        else if (phase === "saving") {
          setPhase("saved")
          onName(profile.name)
        }
      },
      phase === "greeting" ? 650 : 850
    )
    return () => window.clearTimeout(timer)
  }, [busy, phase, onName, profile.name])
  useEffect(() => {
    if (!task || taskReady) return
    const timer = window.setTimeout(() => setTaskReady(true), 1100)
    return () => window.clearTimeout(timer)
  }, [task, taskReady])
  useEffect(() => {
    const approval =
      phase === "saved" &&
      taskReady &&
      task === firstTask.prompt &&
      taskDecision === "pending"
    const response =
      phase === "role" ||
      phase === "confirm" ||
      (phase === "saved" && (!task || (taskReady && task !== firstTask.prompt)))
    onWaiting?.(approval || response, approval ? "approval" : "response")
  }, [phase, task, taskReady, taskDecision, firstTask.prompt, onWaiting])
  const recordTaskDecision = useCallback(
    (id: string, state: DemoDecisionState) => {
      setTaskDecision(state)
      onDecision?.(id, state)
    },
    [onDecision]
  )
  return (
    <div className={styles.setupFlow}>
      <div className={styles.timestamp}>Today 1:08 PM</div>
      {phase !== "greeting" && (
        <DemoResponse>Hi Drew, good to meet you.</DemoResponse>
      )}
      {answer && (
        <div className={`${styles.messageRow} ${styles.userRow}`}>
          <div className={`${styles.message} ${styles.userMessage}`}>
            {answer}
          </div>
        </div>
      )}
      {answer && phase !== "thinking" && (
        <DemoResponse>{profile.proposal}</DemoResponse>
      )}
      {(phase === "saving" || saved) && (
        <div className={`${styles.messageRow} ${styles.userRow}`}>
          <div className={`${styles.message} ${styles.userMessage}`}>
            Save it
          </div>
        </div>
      )}
      {busy && (
        <DemoActivity
          name="New bot"
          state={phase === "saving" ? "working" : "thinking"}
        />
      )}
      {!saved && !busy ? (
        <div className={`dark ${styles.productCard}`}>
          <ChatQuestion
            key={answer ? "confirm" : "role"}
            part={{
              type: "tool-askUser",
              toolCallId: answer ? "demo-confirm" : "demo-role",
              state: "output-available",
              input: {
                question: answer ? "Save this?" : "What should I help with?",
                options: answer ? ["Save it", "Change something"] : options,
              },
              output: {
                question: answer ? "Save this?" : "What should I help with?",
                options: answer ? ["Save it", "Change something"] : options,
              },
            }}
            active
            busy={false}
            onAnswer={(value) => {
              if (!answer) {
                setAnswer(value)
                setPhase("thinking")
                return
              }
              if (value === "Save it") {
                setPhase("saving")
              } else if (value === "Change something") reset()
              else {
                setAnswer(value)
                setPhase("thinking")
              }
            }}
            onDismiss={reset}
          />
        </div>
      ) : saved ? (
        <>
          <div className={styles.system}>Configured as {profile.name}</div>
          <DemoResponse name={profile.name}>Saved. {profile.next}</DemoResponse>
          {!task && (
            <div className={`dark ${styles.productCard}`}>
              <ChatQuestion
                part={{
                  type: "tool-askUser",
                  toolCallId: "demo-first-task",
                  state: "output-available",
                  input: {
                    question: "What should we start with?",
                    options: [firstTask.label, "I’ll send you something else"],
                  },
                  output: {
                    question: "What should we start with?",
                    options: [firstTask.label, "I’ll send you something else"],
                  },
                }}
                active
                busy={false}
                onAnswer={(value) =>
                  setTask(value === firstTask.label ? firstTask.prompt : value)
                }
                onDismiss={() => setTask("I’ll send you something else")}
              />
            </div>
          )}
          {task && (
            <div className={`${styles.messageRow} ${styles.userRow}`}>
              <div className={`${styles.message} ${styles.userMessage}`}>
                {task}
              </div>
            </div>
          )}
          {task && !taskReady && <DemoActivity name={profile.name} />}
          {taskReady && (
            <>
              <DemoResponse name={profile.name}>
                {task === firstTask.prompt
                  ? firstTask.result
                  : "Got it. Send me the source material and the outcome you want, and I’ll work from that."}
              </DemoResponse>
              {task === firstTask.prompt && (
                <DemoApproval
                  entry={firstTask.entry}
                  name={profile.name}
                  decisionId="new-bot:first-task"
                  onDecision={recordTaskDecision}
                  onConfirmation={onConfirmation}
                />
              )}
            </>
          )}
        </>
      ) : null}
    </div>
  )
}
