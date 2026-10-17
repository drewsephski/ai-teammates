import assert from "node:assert/strict"
import test from "node:test"
import {
  botQuestionOutputSchema,
  computerLoginSchema,
  createBotSetupTools,
} from "../lib/bot-setup-tools"
import { canSuggestFollowUps } from "../lib/chat-follow-ups"
import { assertComputerLoginReady } from "../lib/computer-login-policy"

test("sign-in needs computer time left and a screen inspected during this turn, in any chat on any plan", () => {
  for (const remainingSeconds of [300, 1]) {
    assert.doesNotThrow(() =>
      assertComputerLoginReady({ remainingSeconds, screenViewed: true })
    )
    assert.throws(
      () => assertComputerLoginReady({ remainingSeconds, screenViewed: false }),
      /call viewScreen/
    )
  }
  for (const remainingSeconds of [0, -5, Number.NaN]) {
    for (const screenViewed of [false, true]) {
      assert.throws(
        () => assertComputerLoginReady({ remainingSeconds, screenViewed }),
        /computer time is used up/i
      )
    }
  }
})

test("the used-up message names the upgrade only where the tier is known", () => {
  const message = (tier?: "free" | "paid") => {
    try {
      assertComputerLoginReady({
        remainingSeconds: 0,
        screenViewed: true,
        tier,
      })
    } catch (error) {
      return (error as Error).message
    }
  }
  assert.match(message("free")!, /free computer time is used up\. Upgrade/)
  assert.match(message("paid")!, /billing period.*resets/)
  assert.equal(message(), "Your computer time is used up.")
})

const input = {
  question: "Sign in?",
  options: ["Ready", "Cancel"],
  computerLogin: { service: "ESPN Fantasy", hostname: "fantasy.espn.com" },
}
const call = { toolCallId: "login", messages: [], context: {} }

test("login metadata accepts only a bounded service and display domain, never credentials or a URL", () => {
  assert.deepEqual(
    computerLoginSchema.parse(input.computerLogin),
    input.computerLogin
  )
  for (const hostname of [
    "https://espn.com/login?token=secret",
    "user:pass@espn.com",
    "espn.com/path",
    "espn.com\nsecret",
    "",
    "<script>",
  ]) {
    assert.equal(
      computerLoginSchema.safeParse({ ...input.computerLogin, hostname })
        .success,
      false
    )
  }
  assert.equal(
    computerLoginSchema.safeParse({
      service: "x".repeat(81),
      hostname: "espn.com",
    }).success,
    false
  )
})

test("login cards require computer access and retain the installed-app questionnaire contract", async () => {
  const unavailable = createBotSetupTools(async (profile) => profile)
  await assert.rejects(
    async () => unavailable.askUser.execute!(input, call),
    /unavailable/
  )
  let checked = 0
  const tools = createBotSetupTools(async (profile) => profile, {
    prepareComputerLogin: async () => {
      checked++
    },
  })
  const output = botQuestionOutputSchema.parse(
    await tools.askUser.execute!(input, call)
  )
  assert.equal(checked, 1)
  assert.match(output.question, /Sign in to ESPN Fantasy in Desktop/)
  assert.deepEqual(output.options, ["I'm signed in", "Cancel sign-in"])
  assert.deepEqual(output.computerLogin, input.computerLogin)
  assert.equal("answer" in output, false)
  const model = await tools.askUser.toModelOutput!({
    toolCallId: call.toolCallId,
    input,
    output,
  })
  assert.equal(model.type, "text")
  if (model.type === "text") {
    assert.match(model.value, /Stop computer actions now/)
    assert.match(model.value, /call viewScreen to verify access/)
    assert.match(model.value, /cancellation means stop/)
  }
  assert.equal(
    canSuggestFollowUps({
      id: "a",
      role: "assistant",
      parts: [
        { type: "text", text: "Opening ESPN." },
        {
          type: "tool-askUser",
          toolCallId: "login",
          state: "output-available",
          input,
          output,
        },
      ],
    }),
    false
  )
})

test("a failed computer check cannot publish a sign-in card", async () => {
  const tools = createBotSetupTools(async (profile) => profile, {
    prepareComputerLogin: async () => {
      throw new Error("Usage limit reached")
    },
  })
  await assert.rejects(
    async () => tools.askUser.execute!(input, call),
    /Usage limit reached/
  )
  const normal = { question: "Which league?", options: ["Work", "Friends"] }
  assert.deepEqual(await tools.askUser.execute!(normal, call), normal)
})
