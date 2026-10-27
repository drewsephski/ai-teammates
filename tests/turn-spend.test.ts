import assert from "node:assert/strict"
import { test } from "node:test"
import { simulateReadableStream, streamText, tool } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { z } from "zod"

import {
  formatBudget,
  formatSpend,
  isTaskBudget,
  LOOP_STEP_LIMIT,
  priorTaskSpend,
  repeatedSteps,
  stepFingerprint,
  TASK_BUDGETS,
  taskBudgetReached,
  turnCredit,
  turnFailed,
  turnUsageLabel,
  turnUsageNote,
} from "../lib/turn-spend"

const call = (input: unknown, toolName = "bash") => ({
  type: "tool-call",
  toolName,
  input,
})
const result = (output: unknown, toolName = "bash") => ({
  type: "tool-result",
  toolName,
  output,
})
const step = (input: unknown, output: unknown) => ({
  content: [call(input), result(output)],
})

test("a model that failed partway is a failed turn, a stopped or refused one isn't", () => {
  const base = { refused: false, stopped: false }
  assert.equal(turnFailed({ ...base, finishReason: "stop" }), false)
  assert.equal(turnFailed({ ...base, finishReason: "tool-calls" }), false)
  assert.equal(turnFailed({ ...base, finishReason: "length" }), false)
  assert.equal(turnFailed({ ...base, finishReason: "error" }), true)
  // How Trigger.dev reports a provider that threw on a later step
  assert.equal(turnFailed({ ...base, finishReason: undefined }), true)
  assert.equal(turnFailed({ ...base, error: new Error("x") }), true)
  assert.equal(
    turnFailed({ ...base, stopped: true, finishReason: undefined }),
    false
  )
  assert.equal(
    turnFailed({ refused: true, stopped: false, error: new Error("x") }),
    false
  )
})

test("a step's fingerprint ignores call IDs and text, and tells inputs and outputs apart", () => {
  const a = stepFingerprint([
    { type: "text", toolName: undefined },
    { ...call({ cmd: "ls" }), toolCallId: "1" } as never,
    result("a"),
  ])
  const b = stepFingerprint([
    { ...call({ cmd: "ls" }), toolCallId: "2" } as never,
    result("a"),
  ])
  assert.equal(a, b)
  assert.notEqual(
    stepFingerprint([call({ cmd: "ls" }), result("b")]),
    stepFingerprint([call({ cmd: "ls" }), result("a")])
  )
  assert.notEqual(
    stepFingerprint([call({ cmd: "pwd" }), result("a")]),
    stepFingerprint([call({ cmd: "ls" }), result("a")])
  )
  assert.equal(stepFingerprint([{ type: "text" }]), undefined)
  assert.equal(
    stepFingerprint([
      call({}),
      { type: "tool-error", toolName: "bash", error: new Error("no") },
    ]),
    JSON.stringify([
      ["call", "bash", {}],
      ["error", "bash", "Error: no"],
    ])
  )
})

test("only identical trailing steps count as repeats", () => {
  assert.equal(repeatedSteps([]), 0)
  assert.equal(repeatedSteps([{ content: [{ type: "text" }] }]), 0)
  assert.equal(repeatedSteps([step("a", 1)]), 1)
  assert.equal(
    repeatedSteps([step("a", 1), step("b", 1), step("b", 1), step("b", 1)]),
    3
  )
  // The same command with a new result is progress, not a loop
  assert.equal(repeatedSteps([step("a", 1), step("a", 2), step("a", 3)]), 1)
})

test("a failed reply gets everything back, a loop its repeats, a finished one nothing", () => {
  const stepSpends = [100, 200, 300, 400]
  assert.equal(
    turnCredit({ spent: 1000, failed: true, repeated: 0, stepSpends }),
    1000
  )
  // Three identical steps: the first counts, the two after it are given back
  assert.equal(
    turnCredit({
      spent: 1000,
      failed: false,
      repeated: 3,
      stepSpends,
    }),
    700
  )
  assert.equal(
    turnCredit({ spent: 1000, failed: false, repeated: 1, stepSpends }),
    0
  )
  assert.equal(
    turnCredit({ spent: 1000, failed: false, repeated: 0, stepSpends }),
    0
  )
  // Never more than the reply spent
  assert.equal(
    turnCredit({
      spent: 500,
      failed: false,
      repeated: 4,
      stepSpends,
    }),
    500
  )
  assert.equal(
    turnCredit({ spent: 0, failed: true, repeated: 0, stepSpends: [] }),
    0
  )
})

test("a continued task adds up what its earlier replies spent, net of credits", () => {
  const usage = (spent: number, credited = 0) => ({
    type: "data-turnUsage",
    data: { spent, credited, chatgpt: false, failed: false },
  })
  const messages = [
    { id: "old", role: "user", parts: [] },
    { id: "a0", role: "assistant", parts: [usage(9_999)] },
    { id: "root", role: "user", parts: [] },
    { id: "a1", role: "assistant", parts: [{ type: "text" }, usage(300)] },
    { id: "continue_1_root", role: "user", parts: [] },
    { id: "a2", role: "assistant", parts: [usage(500, 200)] },
    // Not trusted to be shaped right
    { id: "a3", role: "assistant", parts: [{ type: "data-turnUsage" }] },
  ]
  assert.equal(priorTaskSpend(messages, "root"), 600)
  assert.equal(priorTaskSpend(messages, "missing"), 0)
})

test("the budget stops a task once it's reached, and only the listed limits are accepted", () => {
  assert.equal(taskBudgetReached(null, 10_000_000), false)
  assert.equal(taskBudgetReached(undefined, 10_000_000), false)
  assert.equal(taskBudgetReached(250_000, 249_999), false)
  assert.equal(taskBudgetReached(250_000, 250_000), true)
  for (const budget of TASK_BUDGETS) assert.equal(isTaskBudget(budget), true)
  assert.equal(isTaskBudget(123), false)
  assert.equal(isTaskBudget(0), false)
})

test("spend and limits read as cents and dollars", () => {
  assert.equal(formatSpend(0), "0¢")
  assert.equal(formatSpend(500), "<0.1¢")
  assert.equal(formatSpend(4_000), "0.4¢")
  assert.equal(formatSpend(10_000), "1¢")
  assert.equal(formatSpend(25_400), "2.5¢")
  assert.equal(formatSpend(99_600), "10¢")
  assert.equal(formatSpend(123_000), "12¢")
  assert.equal(formatSpend(999_000), "$1.00")
  assert.equal(formatSpend(1_204_000), "$1.20")
  assert.deepEqual(TASK_BUDGETS.map(formatBudget), ["5¢", "25¢", "$1", "$5"])
})

test("the reply shows its net spend and says why it stopped", () => {
  const base = { spent: 4_000, credited: 0, chatgpt: false, failed: false }
  assert.equal(turnUsageLabel(base), "0.4¢")
  assert.equal(turnUsageLabel({ ...base, credited: 4_000 }), undefined)
  assert.equal(turnUsageNote(base), undefined)
  assert.equal(
    turnUsageNote({ ...base, stop: "budget", budget: 250_000 }),
    "Stopped at this bot's 25¢ limit per task. Reply to keep going."
  )
  assert.equal(
    turnUsageNote({ ...base, stop: "loop", credited: 3_000 }),
    "Stopped because it kept repeating the same step. Krafty gave back the 0.3¢ the repeats used."
  )
  assert.equal(
    turnUsageNote({ ...base, failed: true, credited: 4_000 }),
    "This reply didn't finish. Krafty gave back the 0.4¢ it used."
  )
  // Nothing was given back, so the note doesn't claim it
  assert.equal(turnUsageNote({ ...base, failed: true }), undefined)
})

// The stop condition trigger/chat.ts uses, on the AI SDK's real step shape
test("a model stuck taking the same step stops at the loop limit", async () => {
  const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  }
  let calls = 0
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          {
            type: "tool-call",
            toolCallId: `call_${++calls}`,
            toolName: "check",
            input: JSON.stringify({ url: "https://example.com" }),
          },
          {
            type: "finish",
            finishReason: { unified: "tool-calls", raw: "tool_use" },
            usage,
          },
        ],
      }),
    }),
  })
  let repeated = 0
  const result = streamText({
    model,
    prompt: "Wait for the deploy",
    tools: {
      check: tool({
        inputSchema: z.object({ url: z.string() }),
        execute: async () => "pending",
      }),
    },
    stopWhen: [
      ({ steps }) => steps.length >= 50,
      ({ steps }) => {
        repeated = repeatedSteps(steps)
        return repeated >= LOOP_STEP_LIMIT
      },
    ],
  })
  await result.consumeStream()
  assert.equal((await result.steps).length, LOOP_STEP_LIMIT)
  assert.equal(repeated, LOOP_STEP_LIMIT)
})

test("a bot's spend limit is optional, nullable, and one of the listed limits", async () => {
  const { botInsertSchema } = await import("../db/schema")
  const bot = { name: "Scout", job: "Research", instructions: null }
  // Older app builds don't send it, so it stays unchanged
  assert.equal(botInsertSchema.safeParse(bot).success, true)
  assert.equal(
    botInsertSchema.safeParse({ ...bot, taskBudget: null }).success,
    true
  )
  assert.equal(
    botInsertSchema.safeParse({ ...bot, taskBudget: 250_000 }).success,
    true
  )
  const wrong = botInsertSchema.safeParse({ ...bot, taskBudget: 123 })
  assert.equal(wrong.success, false)
  assert.equal(
    wrong.error?.issues[0]?.message,
    "Pick one of the listed limits."
  )
})
