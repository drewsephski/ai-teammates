"use client"

import { useEffect, useRef, useState } from "react"
import type { BotMention } from "@/lib/composer"
import { demoAgents, type DemoAgent } from "./chat-demo-data"
import { pendingDemoDecisions, type DemoDecisionState } from "./chat-demo-inbox"

/** Status replies use only facts already present in the example conversations. */
export function demoInvocationReply(
  bot: DemoAgent,
  decisions: Record<string, DemoDecisionState>
) {
  const waiting = pendingDemoDecisions(bot.id, bot.entries, decisions)
  if (
    bot.entries.some(
      (_entry, index) => decisions[`${bot.id}:${index}`] === "running"
    )
  )
    return "I’m still completing the approved action. I’ll confirm when it finishes."
  switch (bot.id) {
    case "rundown":
      return "Your 2 PM client call stays. I asked the dentist for Thursday afternoon, and their reply will be in tomorrow’s rundown."
    case "inbox":
      return waiting
        ? `I went through the 38 unread emails. ${waiting === 2 ? "The archive of 27 newsletters and your reply to Priya are both waiting for your review." : "There’s one request left for your review in my chat."}`
        : "Both review requests are resolved. I did what you approved and left anything you declined alone. The other drafts are still waiting."
    case "release-prep":
      return "v1.4 has 2 blockers: the Safari login redirect loop and the failing migration test. The four nice-to-haves are in v1.5 now."
    case "weekly-recap":
      return "This week you shipped v1.3.2 and the new onboarding flow. Next up is Leo’s revised quote, then the two v1.4 blockers. I’ll remind you about Leo on Monday at 9 AM."
    case "research":
      return waiting
        ? "The 14-inch with 32 GB of memory is the pick at about $1,800. Adding the 3 laptops to your Purchases sheet is waiting for your approval in my chat."
        : bot.entries.some(
              (entry, index) =>
                entry.kind === "approval" &&
                decisions[`${bot.id}:${index}`] === "denied"
            )
          ? "You declined the sheet update, so I left your Purchases sheet unchanged. The comparison is still in our chat."
          : "The 3 laptops are in your Purchases sheet with prices and sources. The 14-inch with 32 GB is still the pick."
    case "prospecting":
      return "I can find businesses that fit what you offer, check who you’ve already contacted, and draft a short intro for each. Sending always waits for your review; the Monday routine only researches and drafts."
    default:
      return "I can help turn this into clear next steps. Share the draft, notes, or constraints you want me to work from."
  }
}

export function formatDemoMentions(
  text: string,
  mentions: BotMention[],
  bots: DemoAgent[]
) {
  return [...mentions]
    .sort((a, b) => b.start - a.start)
    .reduce((value, mention) => {
      const bot = bots.find((bot) => bot.id === mention.botId)
      return bot
        ? value.slice(0, mention.start) +
            `@[${bot.name}]` +
            value.slice(mention.end)
        : value
    }, text)
}

export type RecordDemoMessage = (
  chatId: string,
  text: string,
  kind: "user" | "agent",
  bot: DemoAgent
) => void
export function useDemoInvocation(recordMessage: RecordDemoMessage) {
  const [pending, setPending] = useState<Record<string, DemoAgent | undefined>>(
    {}
  )
  const controllers = useRef(new Map<string, AbortController>())
  useEffect(() => {
    const current = controllers.current
    return () => {
      current.forEach((controller) => controller.abort())
    }
  }, [])
  async function send(
    chatId: string,
    text: string,
    mentions: BotMention[],
    bots: DemoAgent[],
    decisions: Record<string, DemoDecisionState>
  ) {
    if (controllers.current.has(chatId) || !text.trim()) return
    const ids = [...new Set(mentions.map((mention) => mention.botId))]
    const targets = ids.length
      ? ids
          .map((id) => bots.find((bot) => bot.id === id))
          .filter((bot): bot is DemoAgent => !!bot)
      : [bots.find((bot) => bot.id === chatId) ?? demoAgents[0]]
    if (!targets.length) return
    const abort = new AbortController()
    controllers.current.set(chatId, abort)
    recordMessage(
      chatId,
      formatDemoMentions(text, mentions, bots),
      "user",
      targets[0]
    )
    for (const bot of targets) {
      setPending((current) => ({ ...current, [chatId]: bot }))
      await new Promise<void>((resolve) => {
        const done = () => {
          window.clearTimeout(timer)
          abort.signal.removeEventListener("abort", done)
          resolve()
        }
        const timer = window.setTimeout(done, 900)
        abort.signal.addEventListener("abort", done, { once: true })
      })
      if (abort.signal.aborted) return
      recordMessage(chatId, demoInvocationReply(bot, decisions), "agent", bot)
    }
    controllers.current.delete(chatId)
    setPending((current) => ({ ...current, [chatId]: undefined }))
  }
  return { pending, send }
}
