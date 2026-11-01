import assert from "node:assert/strict"
import { test } from "node:test"
import { useCases } from "../app/use-cases/use-cases-data"
import { parseBotAvatar } from "../lib/bot-avatar"
import { botOpeningPrompt } from "../lib/bot-opening"
import { botPresets } from "../lib/bot-presets"
import { botProfileSchema } from "../lib/bot-setup-tools"
import {
  botTemplateInstructions,
  botTemplates,
  findBotTemplate,
  findStartingRole,
} from "../lib/bot-templates"
import { createBotHref } from "../lib/marketing/site"

test("every use case page has a template, and none shadows a preset", () => {
  for (const useCase of useCases) assert.ok(findBotTemplate(useCase.id))
  assert.ok(findBotTemplate("email-assistant"))
  const ids = botTemplates.map((template) => template.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const preset of botPresets) assert.ok(!ids.includes(preset.id))
})

test("templates make valid bots with their own avatar, brief and guidance", () => {
  for (const template of botTemplates) {
    const role = findStartingRole(template.id)
    assert.ok(role, template.id)
    assert.doesNotThrow(
      () => botProfileSchema.parse(role),
      `${template.id} fits the bot profile limits`
    )
    assert.ok(parseBotAvatar(role.avatar ?? ""), template.id)
    assert.ok(template.prompt.length > 0, template.id)
    assert.ok(template.steps.length > 0 && template.apps.length > 0)
    assert.equal(role.brief, template.prompt)
    const instructions = botTemplateInstructions(template)
    assert.match(instructions, /A connection grants access, not permission/)
    assert.match(instructions, /scheduleRoutine/)
    assert.ok(instructions.includes(JSON.stringify(template.prompt)))
  }
})

test("presets still resolve and unknown ids don't", () => {
  for (const preset of botPresets) {
    const role = findStartingRole(preset.id)
    assert.equal(role?.name, preset.name)
    assert.equal(role?.instructions, preset.instructions)
    assert.equal(role?.avatar, undefined)
  }
  assert.equal(findStartingRole("nope"), undefined)
  assert.equal(findBotTemplate("research"), undefined)
})

test("a template bot opens by proposing its brief, without running it", () => {
  const template = findBotTemplate("product-performance")!
  const bot = {
    id: "bot",
    name: template.name,
    job: template.job,
    setupComplete: true,
  }
  const opening = botOpeningPrompt(bot, "Drew", template.prompt)
  assert.match(opening, /already configured/)
  assert.match(opening, /created you from a template/)
  assert.ok(opening.includes(JSON.stringify(template.prompt)))
  assert.match(opening, /Do not execute the brief or call tools yet/)
  assert.doesNotMatch(opening, /three practical, distinct use cases/)
  assert.doesNotMatch(opening, /Drew/)
})

test("create links open the template in the workspace, through sign-up", () => {
  assert.equal(
    createBotHref("product-performance", true),
    "/workspace?create=product-performance"
  )
  const signedOut = new URL(
    createBotHref("product-performance", false),
    "https://kraftybot.app"
  )
  assert.equal(signedOut.pathname, "/sign-up")
  assert.equal(
    signedOut.searchParams.get("redirect_url"),
    "/workspace?create=product-performance"
  )
})
