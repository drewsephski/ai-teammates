import assert from "node:assert/strict"
import test from "node:test"

import { publicPreset } from "../lib/api-shapes"
import { botPresets } from "../lib/bot-presets"
import { findStartingRole } from "../lib/bot-templates"
import { botProfileSchema } from "../lib/bot-setup-tools"
import { buildChatInstructions } from "../lib/chat-instructions"
import {
  espnFantasyFootballUrl,
  fantasyFootballInstructions,
  fantasyFootballPresetId,
} from "../lib/fantasy-football"

test("the optional signup preset resolves to a complete ESPN manager on both clients", () => {
  const matches = botPresets.filter(
    (preset) => preset.id === fantasyFootballPresetId
  )
  assert.equal(matches.length, 1)
  const preset = matches[0]
  const shown = publicPreset(preset)
  assert.equal(shown.label, "Fantasy football")
  assert.match(shown.summary, /ESPN/)
  assert.deepEqual(shown.suggestedApps, ["ESPN Fantasy"])
  assert.equal("instructions" in shown, false)
  assert.equal("icon" in shown, false)

  // The creation service uses this same resolver for web and POST /v1/bots.
  const role = findStartingRole(shown.id)
  assert.ok(role)
  assert.doesNotThrow(() => botProfileSchema.parse(role))
  assert.ok(role.instructions.includes(fantasyFootballInstructions))
})

test("ESPN access uses existing discovery and private sign-in, with no cookie collection", () => {
  const instructions = buildChatInstructions(
    {
      id: "general",
      name: "Helper",
      job: "Assistant",
      instructions: null,
      setupComplete: true,
    },
    undefined,
    true,
    true,
    true
  )
  assert.ok(instructions.includes(espnFantasyFootballUrl))
  assert.match(instructions, /discover relevant connected-app tools first/)
  assert.match(instructions, /askUser with computerLogin/)
  assert.match(instructions, /actual visible hostname/)
  assert.match(instructions, /never request passwords, ESPN_S2, SWID/)
  assert.match(
    instructions,
    /If computer access is unavailable, explain the limit/
  )
})

test("the fantasy role keeps the same workflow exactly once in its runtime instructions", () => {
  const role = findStartingRole(fantasyFootballPresetId)!
  const instructions = buildChatInstructions(
    { id: "coach", ...role, setupComplete: true },
    undefined,
    false,
    true,
    true
  )
  assert.equal(instructions.split(fantasyFootballInstructions).length - 1, 1)
  assert.match(instructions, /Connected-app tools are not configured/)
  assert.match(instructions, /use openOnScreen/)
})

test("lineup instructions bind proposals to the right team and protect every committing move", () => {
  assert.match(
    fantasyFootballInstructions,
    /season, league, team.*scoring week/
  )
  assert.match(
    fantasyFootballInstructions,
    /Resolve multiple leagues or teams with askUser/
  )
  assert.match(
    fantasyFootballInstructions,
    /never move locked players or bypass league rules/
  )
  assert.match(
    fantasyFootballInstructions,
    /Every auto-save is a committing step/
  )
  assert.match(fantasyFootballInstructions, /requestComputerApproval/)
  assert.match(
    fantasyFootballInstructions,
    /Trades, waiver claims, adds and drops need their own explicit request and approval/
  )
  assert.match(
    fantasyFootballInstructions,
    /If the proposed move is stale, stop/
  )
  assert.match(
    fantasyFootballInstructions,
    /read back the affected slots before reporting success/
  )
  assert.match(fantasyFootballInstructions, /never blindly repeat the move/)
  assert.match(
    fantasyFootballInstructions,
    /manual waits for approval, autonomous makes covered start\/sit moves/
  )
})
