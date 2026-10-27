"use client"

import { Shimmer } from "@/components/ai-elements/shimmer"
import { avatarStatusLabels } from "@/lib/avatar-state"
import { BotMark } from "./bot-mark"
import type { DemoAgent } from "./chat-demo-data"
import { demoResponseAgent } from "./chat-demo-response"
import styles from "./chat-demo.module.css"

/** Matches the live chat's avatar, status copy, and shimmer cadence. */
export function DemoActivity({
  name,
  state = "thinking",
  agent,
}: {
  name: string
  state?: "thinking" | "working" | "responding"
  agent?: DemoAgent
}) {
  const author = demoResponseAgent(name, agent)
  return (
    <div
      className={styles.activity}
      data-slot="chat-activity"
      data-state={state}
      role="status"
      aria-live="polite"
      data-bot-id={author.id}
      data-bot-color={author.color}
      data-bot-shape={author.shape}
    >
      <BotMark
        color={author.color}
        shape={author.shape}
        personality={author.id}
        state={state === "responding" ? "listening" : state}
        compact
        className={styles.activityAvatar}
      />
      <span>
        {name} ·{" "}
        <Shimmer as="span" duration={1.6}>
          {avatarStatusLabels[state]}
        </Shimmer>
      </span>
    </div>
  )
}
