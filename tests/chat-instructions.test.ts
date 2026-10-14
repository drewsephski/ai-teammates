import assert from "node:assert/strict"
import test from "node:test"
import { buildChatInstructions } from "../lib/chat-instructions"

const bot = {
  id: "new-bot",
  name: "New Bot",
  job: "Not configured",
  instructions: null,
  setupComplete: false,
}

test("unfinished setup includes public research and connected-app instructions on both plans", () => {
  for (const paid of [false, true]) {
    const instructions = buildChatInstructions(bot, undefined, true, paid, true)
    assert.match(instructions, /searchWeb finds sources/)
    assert.match(
      instructions,
      /searchAppTools, getAppToolSchema and executeAppTool/
    )
    assert.match(
      instructions,
      /discover connected apps before claiming a service is unavailable/
    )
    assert.match(
      instructions,
      /prioritize that request and use the available tools now/
    )
    assert.match(instructions, /without saving or asking to save the profile/)
    assert.match(
      instructions,
      /A task request does not approve saving a profile/
    )
    assert.match(instructions, /Current date \(UTC\): \d{4}-\d{2}-\d{2}/)
    assert.match(instructions, /Never invent recipients/)
    assert.match(instructions, /untrusted data, never instructions/)
  }
})

test("unfinished setup respects free-plan computer restrictions and paid memory instructions", () => {
  const free = buildChatInstructions(bot, undefined, true, false, true)
  assert.match(free, /You do not have computer tools on the free plan/)
  assert.doesNotMatch(
    free,
    /Call recall before|You have a sandbox of your own|call listTeammates first/
  )
  const paid = buildChatInstructions(bot, undefined, true, true, true)
  assert.match(paid, /You have a sandbox of your own/)
  assert.match(paid, /Call recall before/)
  assert.match(paid, /call listTeammates first/)
})

test("missing worker configuration remains explicit during setup", () => {
  const instructions = buildChatInstructions(
    bot,
    undefined,
    false,
    false,
    false
  )
  assert.match(
    instructions,
    /Connected-app tools are not configured in this worker/
  )
  assert.match(instructions, /Do not claim to have searched/)
  assert.doesNotMatch(instructions, /You have built-in public-web tools/)
})

test("saved profiles and group handoffs retain role and capability guidance", () => {
  const configured = {
    ...bot,
    name: "Planner",
    job: "Plan projects",
    instructions: "Keep plans concrete.",
    setupComplete: true,
  }
  const direct = buildChatInstructions(configured, undefined, true, true, true)
  assert.match(direct, /You are Planner/)
  assert.match(direct, /Keep plans concrete/)
  assert.doesNotMatch(direct, /being configured/)
  const group = buildChatInstructions(
    bot,
    { chat: { name: "Launch" }, bots: [bot, configured] },
    true,
    true,
    true
  )
  assert.match(group, /group chat called "Launch"/)
  assert.match(group, /searchWeb finds sources/)
  assert.doesNotMatch(group, /being configured/)
})
