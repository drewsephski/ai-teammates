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
  assert.match(output.question, /current plan includes one connected app/)
  // Shown in the phone app and its notifications, where upgrade prompts aren't allowed
  assert.doesNotMatch(output.question, /upgrade/i)
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

const email = {
  question: "Connect your email so I can send this to Sam.",
  options: ["Yes", "No"],
  appConnections: [
    { toolkit: "gmail", name: "Gmail" },
    { toolkit: "outlook", name: "Outlook" },
  ],
}
const card = (name: string, extra: object = {}) => ({
  name,
  logo: null,
  state: "connect" as const,
  ...extra,
})

test("several apps show one card each, the first also as appConnection", async () => {
  const checked: string[] = []
  const tools = createBotSetupTools(async (profile) => profile, {
    prepareAppConnection: async (app) => {
      checked.push(app.toolkit)
      return card(app.name)
    },
  })
  const output = botQuestionOutputSchema.parse(
    await tools.askUser.execute!(email, call)
  )
  assert.deepEqual(checked, ["gmail", "outlook"])
  assert.equal(output.question, email.question)
  assert.deepEqual(output.options, APP_CONNECTION_OPTIONS)
  assert.deepEqual(
    output.appConnections?.map((card) => card.toolkit),
    ["gmail", "outlook"]
  )
  assert.equal(output.appConnection?.toolkit, "gmail")
  const model = await tools.askUser.toModelOutput!({
    toolCallId: call.toolCallId,
    input: email,
    output,
  })
  if (model.type === "text")
    assert.match(model.value, /Cards to connect Gmail or Outlook are showing/)
})

test("an app that already works fails the question so the bot uses it", async () => {
  const { AppAlreadyConnectedError } = await import("../lib/app-catalog-policy")
  const tools = createBotSetupTools(async (profile) => profile, {
    prepareAppConnection: async (app) => {
      if (app.toolkit === "outlook")
        throw new AppAlreadyConnectedError("Outlook is already connected")
      return card(app.name)
    },
  })
  await assert.rejects(
    async () => tools.askUser.execute!(email, call),
    /Outlook is already connected/
  )
})

test("refused apps drop out, and the rest still show", async () => {
  const tools = createBotSetupTools(async (profile) => profile, {
    prepareAppConnection: async (app) => {
      if (app.toolkit === "outlook") throw new Error("not in the catalog")
      return card(app.name)
    },
  })
  const output = botQuestionOutputSchema.parse(
    await tools.askUser.execute!(email, call)
  )
  assert.equal(output.appConnection?.toolkit, "gmail")
  assert.equal(output.appConnections, undefined)
  const none = createBotSetupTools(async (profile) => profile, {
    prepareAppConnection: async () => {
      throw new Error("not in the catalog")
    },
  })
  await assert.rejects(
    async () => none.askUser.execute!(email, call),
    /not in the catalog/
  )
})

test("an expired app shows only its reconnect card, a full plan one limit card", async () => {
  const expired = createBotSetupTools(async (profile) => profile, {
    prepareAppConnection: async (app) =>
      card(app.name, app.toolkit === "gmail" ? { reconnect: true } : {}),
  })
  const reconnect = botQuestionOutputSchema.parse(
    await expired.askUser.execute!(email, call)
  )
  assert.equal(reconnect.appConnection?.toolkit, "gmail")
  assert.equal(reconnect.appConnections, undefined)
  assert.match(reconnect.question, /Gmail connection expired/)

  const full = createBotSetupTools(async (profile) => profile, {
    prepareAppConnection: async (app) => card(app.name, { state: "planLimit" }),
  })
  const limit = botQuestionOutputSchema.parse(
    await full.askUser.execute!(email, call)
  )
  assert.equal(limit.appConnections, undefined)
  assert.match(limit.question, /Disconnect it to connect Gmail or Outlook/)
})

test("appConnections takes distinct apps, and not with appConnection", () => {
  assert.equal(
    botQuestionSchema.safeParse({
      ...email,
      appConnections: [email.appConnections[0], email.appConnections[0]],
    }).success,
    false
  )
  assert.equal(
    botQuestionSchema.safeParse({
      ...email,
      appConnection: input.appConnection,
    }).success,
    false
  )
  assert.equal(
    botQuestionSchema.safeParse({
      ...email,
      computerLogin: { service: "Gmail", hostname: "mail.google.com" },
    }).success,
    false
  )
})
