import assert from "node:assert/strict"
import { test } from "node:test"
import { botPresets } from "../lib/bot-presets"

test("advanced presets preserve bounded configuration and carry authentication and action guidance into the real bot", () => {
  for (const preset of botPresets) {
    assert.ok(preset.instructions.length <= 4000)
    assert.match(preset.instructions, /end-to-end work/)
    assert.match(preset.instructions, /connected-app APIs/)
    assert.match(preset.instructions, /sign in themselves in the live Desktop/)
    assert.match(
      preset.instructions,
      /A connection grants access, not permission/
    )
    assert.match(preset.prompt, /connect|sign in/)
    assert.ok(preset.suggestedApps.length > 0)
  }
})

test("client-work presets prepare messages for approval and never invent terms", () => {
  for (const id of ["follow-up", "scope"]) {
    const preset = botPresets.find((preset) => preset.id === id)
    assert.ok(preset, id)
    assert.match(preset.instructions, /approval/)
    assert.match(preset.instructions, /Never invent/)
    assert.match(preset.instructions, /scheduleRoutine/)
    assert.ok(preset.suggestedApps.some((app) => app === "Gmail"))
  }
})

test("property presets work from public data and leave contact and publishing to the person", () => {
  const roofRadar = botPresets.find((preset) => preset.id === "roof-radar")
  assert.ok(roofRadar)
  assert.match(roofRadar.instructions, /never invent a storm or a score/)
  assert.match(roofRadar.instructions, /never contact homeowners/)
  assert.match(roofRadar.instructions, /never claim a roof is damaged/)
  assert.match(roofRadar.instructions, /scheduleRoutine/)

  const flyIn = botPresets.find((preset) => preset.id === "fly-in")
  assert.ok(flyIn)
  assert.match(flyIn.instructions, /confirm it sits on the right building/)
  assert.match(flyIn.instructions, /not Google Earth or drone footage/)
  assert.match(flyIn.instructions, /never publish or post the video/)
})
