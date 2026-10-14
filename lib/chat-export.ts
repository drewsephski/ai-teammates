import { isToolUIPart } from "ai"
import { format } from "date-fns"

import { chatAuthorSections } from "./chat-activity"
import type { ChatUIMessage } from "./sandbox-tools"

type Part = ChatUIMessage["parts"][number]
export type ExportToolPart = Extract<Part, { type: `tool-${string}` }>

// The words a reader sees in a reply; tools, receipts and suggestions are left out
export function sectionText(parts: readonly Part[]) {
  return parts
    .flatMap((part) =>
      part.type === "text" && part.text.trim() ? [part.text.trim()] : []
    )
    .join("\n\n")
}

type Block = { kind: "text" | "tool"; value: string }

function partBlocks(
  part: Part,
  toolText: (part: ExportToolPart) => string
): Block[] {
  if (part.type === "text")
    return part.text.trim() ? [{ kind: "text", value: part.text.trim() }] : []
  if (part.type === "dynamic-tool" || !isToolUIPart(part)) return []
  if (part.state === "output-available") {
    switch (part.type) {
      case "tool-consultTeammate":
        return [{ kind: "text", value: part.output.answer.trim() }]
      case "tool-askUser":
        return [
          {
            kind: "text",
            value: [
              `> ${part.output.question}`,
              ...(part.output.options.length
                ? [`> Choices: ${part.output.options.join(" · ")}`]
                : []),
            ].join("\n"),
          },
        ]
      case "tool-handoff":
        return [{ kind: "tool", value: `Handed off to ${part.output.name}` }]
      case "tool-createTeammate":
      case "tool-createGroupChat":
      case "tool-delegateToTeammate":
        return [
          { kind: "tool", value: `Task handed over to ${part.output.name}` },
        ]
    }
  }
  return [{ kind: "tool", value: toolText(part) }]
}

// Consecutive tool calls read as one list; everything else is its own paragraph
function joinBlocks(blocks: Block[]) {
  return blocks
    .map((block, i) => {
      const text = block.kind === "tool" ? `- ${block.value}` : block.value
      if (i === 0) return text
      return (
        (block.kind === "tool" && blocks[i - 1].kind === "tool"
          ? "\n"
          : "\n\n") + text
      )
    })
    .join("")
}

// A conversation as Markdown, in the order and with the authors the chat shows
export function chatTranscriptMarkdown({
  title,
  messages,
  bots,
  fallbackBotId,
  group = false,
  exportedAt = new Date(),
  toolText = (part) => part.type.slice("tool-".length),
}: {
  title: string
  messages: readonly ChatUIMessage[]
  bots: readonly { id: string; name: string }[]
  fallbackBotId?: string
  group?: boolean
  exportedAt?: Date
  toolText?: (part: ExportToolPart) => string
}) {
  const names = new Map(bots.map((bot) => [bot.id, bot.name]))
  const name = (id?: string) => (id && names.get(id)) || "Teammate"
  const turns: string[] = []

  for (const message of messages) {
    if (message.role === "user") {
      const text =
        message.metadata?.displayPrompt?.trim() || sectionText(message.parts)
      if (!text) continue
      const addressee = message.metadata?.botId
      turns.push(
        `**You${group && addressee ? ` → ${name(addressee)}` : ""}**\n\n${text}`
      )
      continue
    }
    if (message.role !== "assistant") continue
    for (const { botId, parts } of chatAuthorSections(message, fallbackBotId)) {
      const blocks = parts.flatMap((part) => partBlocks(part, toolText))
      if (blocks.length)
        turns.push(`**${name(botId)}**\n\n${joinBlocks(blocks)}`)
    }
  }

  const heading = `# ${title}\n\nExported from Krafty on ${format(exportedAt, "MMMM d, yyyy")}.`
  const body = turns.length ? turns.join("\n\n---\n\n") : "_No messages yet._"
  return `${heading}\n\n${body}\n`
}

export function chatExportFileName(title: string, exportedAt = new Date()) {
  const slug =
    title
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "") || "conversation"
  return `${slug}-${format(exportedAt, "yyyy-MM-dd")}.md`
}
