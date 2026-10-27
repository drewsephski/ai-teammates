"use client"

import { BotMark } from "./bot-mark"
import { demoAgents, type DemoAgent } from "./chat-demo-data"
import styles from "./chat-demo.module.css"

export function DemoAvatar({
  agent,
  size = 32,
  working = false,
  waiting = false,
}: {
  agent: DemoAgent
  size?: number
  working?: boolean
  waiting?: boolean
}) {
  if (agent.group) {
    const memberSize = Math.round(size * 0.56)
    return (
      <span
        className={styles.groupAvatar}
        data-bot-id={agent.id}
        style={{ width: size, height: size }}
      >
        {[demoAgents[0], demoAgents[2], demoAgents[3]].map((member, index) => (
          <span
            key={member.id}
            style={{
              width: memberSize,
              height: memberSize,
              left:
                index === 0
                  ? (size - memberSize) / 2
                  : index === 1
                    ? 0
                    : size - memberSize,
              top: index === 0 ? 0 : size - memberSize,
              zIndex: index + 1,
            }}
          >
            <BotMark
              personality={member.id}
              compact
              color={member.color}
              shape={member.shape}
              state={waiting ? "curious" : "idle"}
            />
          </span>
        ))}
      </span>
    )
  }
  return (
    <span
      className={styles.avatar}
      data-bot-id={agent.id}
      data-bot-color={agent.color}
      data-bot-shape={agent.shape}
      style={{ width: size, height: size }}
    >
      <BotMark
        color={agent.color}
        personality={agent.id}
        compact
        shape={agent.shape}
        state={working ? "working" : waiting ? "curious" : "idle"}
      />
      {agent.unread && <span className={styles.unread} />}
    </span>
  )
}
