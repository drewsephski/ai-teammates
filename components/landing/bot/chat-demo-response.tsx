"use client"

import type { ReactNode } from "react"
import { DemoAvatar } from "./chat-demo-avatar"
import { demoAgents, type DemoAgent } from "./chat-demo-data"
import styles from "./chat-demo.module.css"

export function demoResponseAgent(name: string, agent?: DemoAgent) {
  return (
    demoAgents.find((bot) => bot.name === name) ??
    agent ??
    demoAgents.find((bot) => bot.id === "new-bot") ??
    demoAgents[1]
  )
}

export function DemoResponse({
  children,
  name = "New bot",
  agent,
  confirmation = false,
  showAuthor,
}: {
  children: ReactNode
  name?: string
  agent?: DemoAgent
  confirmation?: boolean
  showAuthor?: boolean
}) {
  const author = demoResponseAgent(name, agent)
  return (
    <div
      className={styles.responseRow}
      data-slot={confirmation ? "demo-confirmation" : "demo-response"}
    >
      <DemoAvatar agent={{ ...author, unread: false }} size={24} />
      <div className={styles.responseBody}>
        {(showAuthor ?? agent?.group) && (
          <p className={styles.author}>{name}</p>
        )}
        <div
          className={`${styles.message} ${styles.agentMessage}`}
          role={confirmation ? "status" : undefined}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
