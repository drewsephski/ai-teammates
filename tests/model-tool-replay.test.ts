import assert from "node:assert/strict"
import test from "node:test"
import { normalizeFailedToolCalls } from "../lib/model"

type Prompt = Parameters<typeof normalizeFailedToolCalls>[0]

function failedCall(input: unknown): Prompt {
  return [
    {
      role: "assistant",
      content: [
        { type: "text", text: "Choose a role." },
        { type: "tool-call", toolCallId: "failed", toolName: "askUser", input },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "failed",
          toolName: "askUser",
          output: {
            type: "error-text",
            value: "Invalid JSON; did not execute.",
          },
        },
      ],
    },
    { role: "user", content: [{ type: "text", text: "Email Sam." }] },
  ]
}

test("malformed failed tool arguments cannot poison the next provider request", () => {
  const original = failedCall("{\"options\": ['Writing', 'Research']}")
  const repaired = normalizeFailedToolCalls(original)
  const assistant = repaired[0]
  assert.equal(assistant.role, "assistant")
  if (assistant.role !== "assistant") return
  assert.deepEqual(assistant.content[1], {
    type: "tool-call",
    toolCallId: "failed",
    toolName: "askUser",
    input: {},
  })
  assert.deepEqual(repaired.slice(1), original.slice(1))
  assert.notDeepEqual(repaired, original)
  assert.equal(
    original[0].role === "assistant" &&
      original[0].content[1].type === "tool-call"
      ? original[0].content[1].input
      : undefined,
    "{\"options\": ['Writing', 'Research']}"
  )
})

test("valid object arguments and parseable JSON survive failed-call replay", () => {
  const input = { question: "Choose?", options: ["Writing", "Research"] }
  for (const value of [input, JSON.stringify(input)]) {
    const assistant = normalizeFailedToolCalls(failedCall(value))[0]
    assert.equal(assistant.role, "assistant")
    if (assistant.role === "assistant") {
      const part = assistant.content[1]
      assert.equal(part.type, "tool-call")
      if (part.type === "tool-call") assert.deepEqual(part.input, input)
    }
  }
})

test("failed null, primitive and array arguments become provider-compatible objects", () => {
  for (const input of [null, undefined, 42, ["A"], '"A"', "null", "[]"]) {
    const assistant = normalizeFailedToolCalls(failedCall(input))[0]
    if (assistant.role === "assistant") {
      const part = assistant.content[1]
      if (part.type === "tool-call") assert.deepEqual(part.input, {})
    }
  }
})

test("successful and unresolved tool calls are preserved without authorizing a retry", () => {
  const prompt = failedCall("raw")
  const tool = prompt[1]
  if (tool.role === "tool" && tool.content[0].type === "tool-result")
    tool.content[0].output = { type: "json", value: { sent: true } }
  assert.equal(normalizeFailedToolCalls(prompt), prompt)
  assert.equal(normalizeFailedToolCalls(prompt.slice(0, 1))[0], prompt[0])
})

test("JSON failures are repaired and retain the original failure result", () => {
  const prompt = failedCall("invalid")
  const tool = prompt[1]
  if (tool.role === "tool" && tool.content[0].type === "tool-result")
    tool.content[0].output = {
      type: "error-json",
      value: { code: "INVALID_JSON" },
    }
  const repaired = normalizeFailedToolCalls(prompt)
  assert.deepEqual(repaired[1], prompt[1])
  if (
    repaired[0].role === "assistant" &&
    repaired[0].content[1].type === "tool-call"
  )
    assert.deepEqual(repaired[0].content[1].input, {})
  assert.deepEqual(normalizeFailedToolCalls(repaired), repaired)
})
