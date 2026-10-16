import assert from "node:assert/strict"
import test from "node:test"
import {
  APP_CONNECTION_OPTIONS,
  botQuestionOutputSchema,
  botQuestionSchema,
  createBotSetupTools,
} from "../lib/bot-setup-tools"

const call = { toolCallId: "connect", messages: [], context: {} }
const input = {
  question: "Connect Google Sheets so I can read your league data.",
  options: ["Yes", "No"],
  appConnection: { toolkit: "googlesheets", name: "Sheets" },
}

test("a connect card needs the catalog check", async () => {
  const tools = createBotSetupTools(async (profile) => profile)
  await assert.rejects(
    async () => tools.askUser.execute!(input, call),
    /Connecting apps is unavailable/
  )
})

test("a connect card uses the catalog's name and logo and fixed choices", async () => {
  const checked: unknown[] = []
  const tools = createBotSetupTools(async (profile) => profile, {
    prepareAppConnection: async (app) => {
      checked.push(app)
      return {
        name: "Google Sheets",
        logo: "https://logos.composio.dev/googlesheets.svg",
        state: "connect",
      }
    },
  })
  const output = botQuestionOutputSchema.parse(
    await tools.askUser.execute!(input, call)
  )
  assert.deepEqual(checked, [input.appConnection])
  assert.equal(output.question, input.question)
  assert.deepEqual(output.options, APP_CONNECTION_OPTIONS)
  assert.deepEqual(output.appConnection, {
    toolkit: "googlesheets",
    name: "Google Sheets",
    logo: "https://logos.composio.dev/googlesheets.svg",
    state: "connect",
  })
  const model = await tools.askUser.toModelOutput!({
    toolCallId: call.toolCallId,
    input,
    output,
  })
  assert.equal(model.type, "text")
  if (model.type === "text") {
    assert.match(model.value, /Stop now/)
    assert.match(model.value, /searchAppTools/)
    assert.doesNotMatch(model.value, /plan-limit/)
  }
})

test("at the free app limit the card explains the limit", async () => {
  const tools = createBotSetupTools(async (profile) => profile, {
    prepareAppConnection: async () => ({
      name: "Google Sheets",
      logo: null,
      state: "planLimit",
    }),
  })
  const output = botQuestionOutputSchema.parse(
    await tools.askUser.execute!(input, call)
  )
  assert.equal(output.appConnection?.state, "planLimit")
  assert.match(output.question, /free plan includes one connected app/)
  assert.deepEqual(output.options, APP_CONNECTION_OPTIONS)
  const model = await tools.askUser.toModelOutput!({
    toolCallId: call.toolCallId,
    input,
    output,
  })
  if (model.type === "text") assert.match(model.value, /plan-limit state/)
})

test("catalog refusals fail the tool so the bot falls back", async () => {
  const tools = createBotSetupTools(async (profile) => profile, {
    prepareAppConnection: async () => {
      throw new Error("Canvas can't be connected from chat")
    },
  })
  await assert.rejects(
    async () =>
      tools.askUser.execute!(
        { ...input, appConnection: { toolkit: "canvas", name: "Canvas" } },
        call
      ),
    /can't be connected from chat/
  )
})

test("the model can't supply a logo, a bad slug, or a sign-in and a connection at once", () => {
  const parsed = botQuestionSchema.parse({
    ...input,
    appConnection: { ...input.appConnection, logo: "https://evil.example/x" },
  })
  assert.equal("logo" in (parsed.appConnection ?? {}), false)
  for (const toolkit of ["../gmail", "Google Sheets", "", "a".repeat(101)])
    assert.equal(
      botQuestionSchema.safeParse({
        ...input,
        appConnection: { toolkit, name: "x" },
      }).success,
      false
    )
  assert.equal(
    botQuestionSchema.safeParse({
      ...input,
      computerLogin: { service: "ESPN", hostname: "espn.com" },
    }).success,
    false
  )
  // A plain question is unchanged for installed apps
  assert.equal(
    botQuestionSchema.safeParse({ question: "Which?", options: ["A", "B"] })
      .success,
    true
  )
})

test("without a computer the model doesn't promise one", async () => {
  const tools = createBotSetupTools(async (profile) => profile, {
    computerAvailable: false,
    prepareAppConnection: async () => ({
      name: "Google Sheets",
      logo: null,
      state: "connect",
    }),
  })
  const output = botQuestionOutputSchema.parse(
    await tools.askUser.execute!(input, call)
  )
  const model = await tools.askUser.toModelOutput!({
    toolCallId: call.toolCallId,
    input,
    output,
  })
  if (model.type === "text") {
    assert.match(model.value, /isn't available on their plan yet/)
    assert.doesNotMatch(model.value, /do the task on the computer's browser/)
  }
})
