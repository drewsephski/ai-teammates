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
    case "chief-of-staff":
      return "The board deck review is at 2 PM. The venue availability request is sent; I’m waiting on the final quote before any booking commitment."
    case "inbox-manager":
      return waiting
        ? `I reviewed the 41 unread threads. ${waiting === 2 ? "The 26-thread archive and Dana’s renewal reply are both waiting for your review." : "There’s one remaining request for your review in my chat."}`
        : "Both review requests are resolved. I completed the actions you approved and left declined actions undone. The remaining drafts are still held."
    case "account-manager":
      return "Acme renews in 60 days. There are 214 active seats, two open questions, and a renewal review scheduled with Vicky. The Globex re-engagement note is still a draft."
    case "talent-scout":
      return "I shortlisted 12 platform engineers and skipped the 11 people already in the ATS. Mara leads the list for her ingestion work; Tomás and Grace are also strong matches. The outreach drafts are ready to review."
    case "expense-manager":
      return waiting
        ? "All 9 receipts are reconciled: $2,340 across 3 trips. The two Harbor Hotel charges are separate nights. The report is ready for your approval in my chat."
        : bot.entries.some(
              (entry, index) =>
                entry.kind === "approval" &&
                decisions[`${bot.id}:${index}`] === "denied"
            )
          ? "The receipts are reconciled, but you declined submission. I’ve left the report unfiled."
          : "The expense report is filed: 9 receipts, $2,340 across 3 trips. Both Harbor Hotel nights are accounted for."
    case "sales-outbound":
      return "I can research the prospect sheet, add account context, and draft outreach. Sending stays behind your review; the weekly workflow researches and drafts without automatically sending."
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
