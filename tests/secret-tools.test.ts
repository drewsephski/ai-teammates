import assert from "node:assert/strict"
import { test } from "node:test"

import { createSecretTools, secretRequestSchema } from "../lib/secret-tools"

const call = { toolCallId: "t", messages: [], context: {} }
const request = {
  name: "OPENAI_API_KEY",
  label: "OpenAI API key",
  description: "Create one under API keys in your OpenAI dashboard.",
  url: "https://platform.openai.com/api-keys",
}

async function modelText(
  tools: ReturnType<typeof createSecretTools>,
  output: unknown
) {
  const model = await tools.requestSecret.toModelOutput!({
    toolCallId: "t",
    input: request,
    output: output as never,
  })
  assert.equal(model.type, "text")
  return model.type === "text" ? model.value : ""
}

test("a saved key returns at once and tells the bot to use $NAME", async () => {
  const asked: string[] = []
  const tools = createSecretTools({
    hasSecret: async (name) => {
      asked.push(name)
      return true
    },
  })
  const output = await tools.requestSecret.execute!(request, call)
  assert.deepEqual(output, {
    state: "saved",
    name: "OPENAI_API_KEY",
    label: "OpenAI API key",
  })
  assert.deepEqual(asked, ["OPENAI_API_KEY"])
  const text = await modelText(tools, output)
  assert.match(text, /already saved/)
  assert.match(text, /\$OPENAI_API_KEY/)
  assert.match(text, /Never print, echo, log or write its value/)
})

test("a missing key shows the card and tells the bot to stop and wait", async () => {
  const tools = createSecretTools({ hasSecret: async () => false })
  const output = await tools.requestSecret.execute!(request, call)
  assert.deepEqual(output, { state: "requested", ...request })
  const text = await modelText(tools, output)
  assert.match(text, /private card/)
  assert.match(text, /Stop now and wait/)
  assert.match(text, /you'll get a message/)
  assert.match(text, /\$OPENAI_API_KEY/)
  assert.match(text, /Never ask them to paste the key in chat/)
  assert.match(text, /never print, echo, log or write its value/)
})

test("the url is optional", async () => {
  const tools = createSecretTools({ hasSecret: async () => false })
  const withoutUrl = {
    name: request.name,
    label: request.label,
    description: request.description,
  }
  const output = await tools.requestSecret.execute!(withoutUrl, call)
  assert.deepEqual(output, { state: "requested", ...withoutUrl })
})

test("the schema refuses bad names, reserved names and non-https pages", () => {
  for (const name of [
    "openai_key",
    "1KEY",
    "A",
    "MY-KEY",
    "PATH",
    "E2B_TOKEN",
    "LD_PRELOAD",
  ])
    assert.equal(
      secretRequestSchema.safeParse({ ...request, name }).success,
      false,
      name
    )
  for (const url of [
    "http://platform.openai.com/api-keys",
    "javascript:alert(1)",
    "not a url",
  ])
    assert.equal(
      secretRequestSchema.safeParse({ ...request, url }).success,
      false,
      url
    )
  assert.equal(
    secretRequestSchema.safeParse({ ...request, label: "" }).success,
    false
  )
  assert.equal(
    secretRequestSchema.safeParse({ ...request, description: "x".repeat(241) })
      .success,
    false
  )
  // Trimmed before checking
  assert.equal(
    secretRequestSchema.parse({ ...request, name: "  GITHUB_TOKEN " }).name,
    "GITHUB_TOKEN"
  )
})

test("the tool never accepts or returns a value", async () => {
  const tools = createSecretTools({ hasSecret: async () => false })
  const value = "sk-live-abcdef1234567890"
  // A value smuggled into the input is dropped by the schema
  const output = await tools.requestSecret.execute!(
    { ...request, value } as typeof request,
    call
  )
  assert.equal(JSON.stringify(output).includes(value), false)
  assert.equal("value" in (output as object), false)
  for (const state of ["saved", "requested"]) {
    const text = await modelText(tools, { ...request, state })
    assert.equal(text.includes(value), false)
  }
})
