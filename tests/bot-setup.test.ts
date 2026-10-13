import assert from "node:assert/strict"
import test from "node:test"
import { chatPreview } from "../lib/chat-preview"
import {
  botColors,
  botShapes,
  createBotAvatar,
  parseBotAvatar,
} from "../lib/bot-avatar"
import {
  botProfileSchema,
  botQuestionSchema,
  createBotSetupTools,
} from "../lib/bot-setup-tools"

test("bot profiles validate shared limits and exclude server-owned fields", () => {
  assert.deepEqual(
    botProfileSchema.parse({
      name: "  Copy Editor  ",
      job: "  Product writing  ",
      instructions: "  Keep copy factual.  ",
      id: "foreign",
      userId: "foreign",
      avatar: "foreign",
      sandboxId: "foreign",
      setupComplete: false,
      pinnedAt: new Date(),
    }),
    {
      name: "Copy Editor",
      job: "Product writing",
      instructions: "Keep copy factual.",
    }
  )
  for (const values of [
    { name: " ", job: "Writing" },
    { name: "x".repeat(51), job: "Writing" },
    { name: "Editor", job: "x".repeat(101) },
    { name: "Editor", job: "Writing", instructions: "x".repeat(4001) },
  ])
    assert.equal(botProfileSchema.safeParse(values).success, false)
})

test("setup choices are bounded and distinct after trimming", () => {
  for (const options of [
    ["Only one"],
    ["Yes", " Yes "],
    ["", "No"],
    Array.from({ length: 6 }, (_, i) => String(i)),
  ])
    assert.equal(
      botQuestionSchema.safeParse({ question: "Choose?", options }).success,
      false
    )
  assert.equal(
    botQuestionSchema.safeParse({ question: " ", options: ["Yes", "No"] })
      .success,
    false
  )
})

test("displaying a question does not fabricate a human answer", async () => {
  const tools = createBotSetupTools(async (profile) => profile)
  const input = {
    question: "What should I help with?",
    options: ["Writing", "Research"],
  }
  const output = await tools.askUser.execute!(input, {
    toolCallId: "question",
    messages: [],
    context: {},
  })
  assert.deepEqual(output, input)
  assert.equal("answer" in output, false)
  const modelOutput = await tools.askUser.toModelOutput!({
    toolCallId: "question",
    input,
    output,
  })
  assert.equal(modelOutput.type, "text")
  if (modelOutput.type === "text")
    assert.match(modelOutput.value, /No answer has been supplied/)
})

test("configuration writes validated profile fields and surfaces save failures", async () => {
  let saved = false
  const tools = createBotSetupTools(async (profile) => {
    saved = true
    return profile
  })
  const options = { toolCallId: "configure", messages: [], context: {} }
  await assert.rejects(async () =>
    tools.configureBot.execute!(
      { name: " ", job: "Writing", instructions: null },
      options
    )
  )
  assert.equal(saved, false)
  const failing = createBotSetupTools(async () => {
    throw new Error("Bot deleted")
  })
  await assert.rejects(
    async () =>
      failing.configureBot.execute!(
        { name: "Editor", job: "Writing", instructions: null },
        options
      ),
    /Bot deleted/
  )
})

test("generated blob avatars use supported shapes and colors; malformed values are rejected", () => {
  for (let i = 0; i < 100; i++) {
    const avatar = parseBotAvatar(createBotAvatar())
    assert.ok(avatar)
    assert.ok(botShapes.includes(avatar.shape as (typeof botShapes)[number]))
    assert.ok(botColors.includes(avatar.color))
  }
  for (const value of [
    "legacy",
    "blob:unknown:0",
    "blob:egg:-1",
    "blob:egg:8",
    "blob:egg:NaN",
    "blob:egg:1:extra",
  ])
    assert.equal(parseBotAvatar(value), null)
})
test("sidebar previews show readable copy without changing literal filenames or arithmetic", () => {
  assert.equal(
    chatPreview(
      "I'm now **Copy Editor**, focused on _product writing_. See [brief](https://example.com)."
    ),
    "I'm now Copy Editor, focused on product writing. See brief."
  )
  assert.equal(
    chatPreview("Open `file_name.ts` and calculate 2 * 3."),
    "Open file_name.ts and calculate 2 * 3."
  )
  assert.equal(chatPreview("I'm now **Copy..."), "I'm now Copy...")
})
