import assert from "node:assert/strict"
import test from "node:test"

import { currentTurn, withoutEarlierImages } from "../lib/model"

const image = {
  type: "image-data" as const,
  data: "AAAA",
  mediaType: "image/png",
}

test("only the current turn's images reach the model", () => {
  const prompt = [
    { role: "system" as const, content: "You are Quill" },
    {
      role: "user" as const,
      content: [{ type: "file" as const, data: "x", mediaType: "image/png" }],
    },
    {
      role: "tool" as const,
      content: [
        {
          type: "tool-result" as const,
          toolCallId: "1",
          toolName: "viewScreen",
          output: { type: "content" as const, value: [image] },
        },
      ],
    },
    {
      role: "user" as const,
      content: [{ type: "text" as const, text: "And now?" }],
    },
    {
      role: "tool" as const,
      content: [
        {
          type: "tool-result" as const,
          toolCallId: "2",
          toolName: "viewScreen",
          output: { type: "content" as const, value: [image] },
        },
      ],
    },
  ]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = withoutEarlierImages(prompt as any) as any[]
  assert.equal(result[1].content[0].type, "text")
  assert.equal(result[2].content[0].output.value[0].type, "text")
  // The current turn keeps its screenshot
  assert.equal(result[4].content[0].output.value[0].type, "image-data")
  assert.deepEqual(
    currentTurn([
      { role: "user" },
      { role: "assistant" },
      { role: "user" },
      { role: "tool" },
    ]),
    [{ role: "user" }, { role: "tool" }]
  )
})
