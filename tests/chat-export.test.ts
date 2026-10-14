import assert from "node:assert/strict"
import test from "node:test"
import {
  chatExportFileName,
  chatTranscriptMarkdown,
  sectionText,
} from "../lib/chat-export"
import type { ChatUIMessage } from "../lib/sandbox-tools"

type Part = ChatUIMessage["parts"][number]

const exportedAt = new Date(2026, 9, 14, 12)
const bots = [
  { id: "scout", name: "Scout" },
  { id: "quill", name: "Quill" },
]

test("copied text is the reply's words, without tool calls or empty parts", () => {
  const parts = [
    { type: "text", text: "  First **paragraph**.  " },
    {
      type: "tool-searchWeb",
      toolCallId: "search",
      state: "input-available",
      input: { query: "launch" },
    },
    { type: "text", text: "   " },
    { type: "text", text: "Second paragraph." },
  ] as Part[]
  assert.equal(sectionText(parts), "First **paragraph**.\n\nSecond paragraph.")
  assert.equal(sectionText([]), "")
})

test("a transcript lists turns in order with their authors and compact tool lines", () => {
  const messages: ChatUIMessage[] = [
    { id: "setup", role: "system", parts: [{ type: "text", text: "Hidden" }] },
    {
      id: "u1",
      role: "user",
      metadata: { botId: "scout", displayPrompt: "/research launch" },
      parts: [{ type: "text", text: "Expanded research prompt" }],
    },
    {
      id: "a1",
      role: "assistant",
      metadata: { botId: "scout" },
      parts: [
        { type: "step-start" },
        {
          type: "tool-searchWeb",
          toolCallId: "s1",
          state: "input-available",
          input: { query: "launch" },
        },
        {
          type: "tool-readWebPage",
          toolCallId: "s2",
          state: "input-available",
          input: { url: "https://example.com" },
        },
        { type: "text", text: "Here is what I found." },
        {
          type: "tool-handoff",
          toolCallId: "h1",
          state: "output-available",
          input: { botId: "quill", note: "Write it up" },
          output: { botId: "quill", name: "Quill" },
        },
        { type: "text", text: "Draft ready." },
      ] as Part[],
    },
  ]

  const markdown = chatTranscriptMarkdown({
    title: "Launch crew",
    messages,
    bots,
    fallbackBotId: "scout",
    group: true,
    exportedAt,
    toolText: (part) => `Tool ${part.type}`,
  })

  assert.equal(
    markdown,
    [
      "# Launch crew",
      "",
      "Exported from Krafty on October 14, 2026.",
      "",
      "**You → Scout**",
      "",
      "/research launch",
      "",
      "---",
      "",
      "**Scout**",
      "",
      "- Tool tool-searchWeb",
      "- Tool tool-readWebPage",
      "",
      "Here is what I found.",
      "",
      "- Handed off to Quill",
      "",
      "---",
      "",
      "**Quill**",
      "",
      "Draft ready.",
      "",
    ].join("\n")
  )
})

test("teammate contributions and questions keep their content; unknown authors stay anonymous", () => {
  const messages: ChatUIMessage[] = [
    {
      id: "u1",
      role: "user",
      metadata: { botId: "scout" },
      parts: [{ type: "text", text: "Ask around" }],
    },
    {
      id: "a1",
      role: "assistant",
      metadata: { botId: "ghost" },
      parts: [
        {
          type: "tool-consultTeammate",
          toolCallId: "c1",
          state: "output-available",
          input: { botId: "quill", prompt: "Thoughts?" },
          output: { botId: "quill", name: "Quill", answer: "Ship it." },
        },
        {
          type: "tool-askUser",
          toolCallId: "q1",
          state: "output-available",
          input: { question: "Save this?", options: ["Save it", "Change"] },
          output: { question: "Save this?", options: ["Save it", "Change"] },
        },
      ] as Part[],
    },
  ]

  const markdown = chatTranscriptMarkdown({
    title: "Scout",
    messages,
    bots,
    exportedAt,
  })

  // A direct chat never labels who the person's message was for
  assert.ok(markdown.includes("**You**\n\nAsk around"))
  assert.ok(markdown.includes("**Quill**\n\nShip it."))
  assert.ok(
    markdown.includes(
      "**Teammate**\n\n> Save this?\n> Choices: Save it · Change"
    )
  )
})

test("an empty conversation still exports, and file names are safe slugs", () => {
  assert.ok(
    chatTranscriptMarkdown({ title: "Scout", messages: [], bots, exportedAt })
      .trimEnd()
      .endsWith("_No messages yet._")
  )
  assert.equal(
    chatExportFileName("Café: Q4 launch / plan!", exportedAt),
    "cafe-q4-launch-plan-2026-10-14.md"
  )
  assert.equal(
    chatExportFileName("🚀🚀", exportedAt),
    "conversation-2026-10-14.md"
  )
})
