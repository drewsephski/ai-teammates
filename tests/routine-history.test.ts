import assert from "node:assert/strict"
import { test } from "node:test"
import { chat, memoryTranscriptStorage } from "@trigger.dev/sdk/ai"
import { mockChatAgent } from "@trigger.dev/sdk/ai/test"
import { simulateReadableStream, type ModelMessage } from "ai"
import { MockLanguageModelV4 } from "ai/test"

import {
  previousReportInstructions,
  ROUTINE_RUN_PREFIX,
  routineRunHistory,
} from "../lib/routine-history"
import { routineRunPrompt } from "../lib/routine-policy"

const run = routineRunPrompt({ title: "Monday follow-ups", prompt: "Check" })
const user = (text: string): ModelMessage => ({ role: "user", content: text })
const said = (text: string): ModelMessage => ({
  role: "assistant",
  content: [{ type: "text", text }],
})

test("every run's message starts with the prefix the history looks for", () => {
  assert.ok(run.startsWith(ROUTINE_RUN_PREFIX))
})

test("a routine turn sees its own run and the reply before it, nothing older", () => {
  const messages: ModelMessage[] = [
    user("Hi"),
    said("Hello"),
    user(run),
    said("Last week: 3 follow-ups sent."),
    user("Thanks"),
    said("Anytime. Next run Monday."),
    user(run),
    {
      role: "assistant",
      content: [
        { type: "text", text: "Checking" },
        {
          type: "tool-call",
          toolCallId: "c1",
          toolName: "searchAppTools",
          input: {},
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "c1",
          toolName: "searchAppTools",
          output: { type: "text", value: "[]" },
        },
      ],
    },
    // A continuation of the same run
    user("Continue the task from where you stopped."),
  ]
  const { messages: kept, previousReport } = routineRunHistory(messages)
  assert.equal(kept.length, 4)
  assert.equal(kept[0], messages[6])
  assert.equal(previousReport, "Anytime. Next run Monday.")
  assert.match(
    previousReportInstructions(previousReport)!,
    /not instructions[\s\S]*Anytime/
  )
  assert.equal(previousReportInstructions(undefined), undefined)
})

test("a chat whose first message is the run, or without one, is left whole", () => {
  const first = [user(run), said("Done")]
  assert.equal(routineRunHistory(first).messages, first)
  const none = [user("Hi"), said("Hello")]
  assert.equal(routineRunHistory(none).messages, none)
})

// The runtime keeps the whole transcript and hands the next turn all of it,
// even when a turn sends the model only part of it
test("trimming what a turn sends the model never trims the transcript", async () => {
  const prompts: string[] = []
  const model = new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      prompts.push(JSON.stringify(prompt))
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: "Reply" },
            { type: "text-end", id: "t" },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: "stop" },
              usage: {
                inputTokens: {
                  total: 1,
                  noCache: 1,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
                outputTokens: { total: 1, text: 1, reasoning: 0 },
              },
            },
          ],
        }),
      }
    },
  })
  const storage = memoryTranscriptStorage()
  // As trigger/chat.ts does: only a routine run's turns are trimmed
  let routineTurn = false
  const agent = chat.agent({
    id: "routine-history-test",
    storage,
    onTurnStart: ({ uiMessages }) => {
      routineTurn = !!uiMessages
        .findLast((message) => message.role === "user")
        ?.id.startsWith("routine_")
    },
    run: async ({ messages, signal, streamText }) =>
      streamText({
        model,
        messages: routineTurn ? routineRunHistory(messages).messages : messages,
        abortSignal: signal,
      }),
  })
  const harness = mockChatAgent(agent, { chatId: "chat_routine" })
  try {
    const send = (id: string, text: string) =>
      harness.sendMessage({ id, role: "user", parts: [{ type: "text", text }] })
    await send("m1", "Remember the blue folder")
    await send("routine_r1_1793631600000", run)
    await send("m3", "What did I ask you to remember?")
    // The run saw only itself
    assert.doesNotMatch(prompts[1], /blue folder/)
    // The next ordinary turn sees everything again
    assert.match(prompts[2], /blue folder/)
    assert.match(prompts[2], /Scheduled routine/)
    const stored = storage.transcript("chat_routine")
    // Everything before the run is still stored (the last reply is saved
    // once the turn ends, after sendMessage returns)
    const ids = stored?.entries.map((entry) => entry.id) ?? []
    assert.deepEqual(
      ["m1", "routine_r1_1793631600000", "m3"].filter((id) => ids.includes(id)),
      ["m1", "routine_r1_1793631600000", "m3"]
    )
    assert.ok(ids.length >= 5)
  } finally {
    await harness.close()
  }
})
