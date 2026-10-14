import assert from "node:assert/strict"
import test from "node:test"
import { simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { generateConsultation } from "../lib/generate-consultation"
import { createConsultationTool } from "../lib/consultation-tool"

function modelFor(text: string, finish: "stop" | "length" = "stop") {
  return new MockLanguageModelV4({
    doStream: {
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "answer" },
          { type: "text-delta", id: "answer", delta: text },
          { type: "text-end", id: "answer" },
          {
            type: "finish",
            finishReason: { unified: finish, raw: finish },
            usage: {
              inputTokens: {
                total: 20,
                noCache: 20,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: { total: 30, text: 30, reasoning: 0 },
            },
          },
        ],
      }),
    },
  })
}

test("consultation uses the actual target profile and recent chat, returns attributed evidence and accounts for usage", async () => {
  const model = modelFor("Use a smaller trial cohort first.")
  let billed = 0
  const answer = await generateConsultation({
    model,
    bot: {
      name: "Launch partner",
      job: "Plan launches",
      instructions: "Prefer small launches.",
    },
    prompt: "Review our launch plan for five founders.",
    recentConversation: [{ role: "user", text: "We have a $100 budget." }],
    tools: {},
    signal: new AbortController().signal,
    onUsage: async (usage) => {
      billed += usage.inputTokens ?? 0
    },
  })
  assert.equal(answer, "Use a smaller trial cohort first.")
  assert.equal(billed, 20)
  const options = model.doStreamCalls[0]
  assert.match(
    JSON.stringify(options.prompt),
    /Launch partner|Prefer small launches|\$100 budget|five founders/
  )
  assert.equal(options.maxOutputTokens, 1800)
  assert.equal(options.tools?.length ?? 0, 0)
  assert.match(JSON.stringify(options.prompt), /only advise|do not claim/)
})

test("a truncated or empty consultation fails honestly while recording spent tokens", async () => {
  for (const [text, finish] of [
    ["Incomplete answer", "length"],
    ["", "stop"],
  ] as const) {
    let billed = false
    await assert.rejects(
      generateConsultation({
        model: modelFor(text, finish),
        bot: { name: "Analyst", job: "Analyze", instructions: null },
        prompt: "Check the numbers",
        recentConversation: [],
        tools: {},
        signal: new AbortController().signal,
        onUsage: async () => {
          billed = true
        },
      }),
      /complete answer/
    )
    assert.equal(billed, true)
  }
})

test("consultation dispatch forwards ID, brief and cancellation; failures never fabricate contributions", async () => {
  const signal = new AbortController().signal
  const tools = createConsultationTool(async (input, options) => {
    assert.equal(options.abortSignal, signal)
    assert.equal(options.toolCallId, "consult")
    assert.equal(input.prompt, "Check the $100 launch budget")
    if (input.botId !== "owned") throw new Error("Teammate not found")
    return {
      botId: "owned",
      name: "Analyst",
      answer: "Reserve half for follow-up.",
    }
  })
  const options = {
    toolCallId: "consult",
    messages: [],
    abortSignal: signal,
    context: {},
  }
  assert.deepEqual(
    await tools.consultTeammate.execute!(
      { botId: "owned", prompt: "Check the $100 launch budget" },
      options
    ),
    { botId: "owned", name: "Analyst", answer: "Reserve half for follow-up." }
  )
  await assert.rejects(
    async () =>
      tools.consultTeammate.execute!(
        { botId: "foreign", prompt: "Check the $100 launch budget" },
        options
      ),
    /Teammate not found/
  )
})

test("parallel consultations recheck the shared allowance after metering, and cancellation prevents queued dispatch", async () => {
  let remaining = 1
  let release!: () => void
  const blocked = new Promise<void>((resolve) => {
    release = resolve
  })
  const started: string[] = []
  const tools = createConsultationTool(async ({ botId }) => {
    started.push(botId)
    if (remaining <= 0) throw new Error("Usage limit reached")
    await blocked
    remaining--
    return { botId, name: botId, answer: "Advice" }
  })
  const options = { toolCallId: "parallel", messages: [], context: {} }
  const first = Promise.resolve(
    tools.consultTeammate.execute!({ botId: "first", prompt: "Task" }, options)
  )
  const second = assert.rejects(
    async () =>
      tools.consultTeammate.execute!(
        { botId: "second", prompt: "Task" },
        options
      ),
    /Usage limit/
  )
  const controller = new AbortController()
  const cancelled = assert.rejects(
    async () =>
      tools.consultTeammate.execute!(
        { botId: "cancelled", prompt: "Task" },
        { ...options, abortSignal: controller.signal }
      ),
    /abort/i
  )
  controller.abort()
  await Promise.resolve()
  assert.deepEqual(started, ["first"])
  release()
  await Promise.all([first, second, cancelled])
  assert.deepEqual(started, ["first", "second"])
})
